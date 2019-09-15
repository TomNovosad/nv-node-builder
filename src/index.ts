import path from "path";
import fs from "fs-extra";
import { compile } from "nexe";
import has from 'lodash.has';
import { Stats } from "webpack";
import { Config, Environments, LogLevel } from "./types";
import { isEmptyString, log, logDivider } from "./shared";
import * as xmlbuilder from "xmlbuilder";
import * as os from "os";

const webpack = require("webpack");

export class Builder {

    private config: Config;

    public async start() {
        try {
            logDivider();
            log(LogLevel.Info, `Starting Node Builder v1.0.0, Node.js ${process.version}, ${os.type()} (${os.arch()}).`);
            log(LogLevel.Info, `Running in \`${process.cwd()}\``);
            logDivider();
            await this.setConfig();
            await this.build();
            await this.createBinaries();
            await this.createNodePackage();
            await this.createDockerContainer();
            await this.createLinuxService();
            await this.createWinService();
            await fs.remove(this.config.dirs.temp);
        } catch (e) {
            log(LogLevel.Error, e);
            process.exit();
        }
    }

    private async setConfig() {
        try {
            const pkg = require(path.join(process.cwd(), 'package.json'));
            this.checkBuildConfig(pkg);

            this.config = pkg.builder;
            this.config.shortcut = pkg.name.substr(pkg.name.search("/") + 1);
            this.config.version = pkg.version;
            this.config.dirs = {
                build: path.join(process.cwd(), this.config.dirs.build),
                temp: path.join(process.cwd(), `${this.config.dirs.build}/temp`),
                src: path.join(process.cwd(), this.config.dirs.src),
            };

            await fs.emptyDir(this.config.dirs.build);

            await fs.ensureDir(this.config.dirs.build);
            await fs.ensureDir(this.config.dirs.temp);

        } catch (e) {
            throw e;
        }
    }

    private build() {
        return new Promise((resolve, reject) => {
            const start = Date.now();

            logDivider();
            log(LogLevel.Info, `Running \`webpack\`...`);

            const webpackConfig = {
                mode: 'production',
                context: this.config.dirs.src,
                entry: path.join(this.config.dirs.src, this.config.entry),
                target: 'node',
                output: {
                    path: this.config.dirs.temp,
                    filename: `${this.config.shortcut}.js`
                },
                plugins: [
                    new webpack.EnvironmentPlugin({
                        VERSION: process.env.npm_package_version || process.env.VERSION
                    })
                ]
            };

            webpack(webpackConfig, (err: Error, stats: Stats) => {

                if (err) {
                    console.error(err.stack || err);
                    reject(err);
                }

                console.log(stats.toString({
                    colors: true,
                    warnings: false,
                    depth: true,
                    hash: false,
                    entrypoints: true,
                    maxModules: 30
                }));

                const end = Date.now();

                log(LogLevel.Ok, `Finished in ${(end - start) / 1000}s`);
                resolve();
            });
        });
    }

    private async createBinaries() {
        try {
            const environments = this.config.environments.filter((value: string) => value != Environments.Docker) || [];

            if (environments.length > 0) {

                for (let environment of environments) {
                    const target = `${environment}-${this.config.node}`;
                    const outputDir = path.join(this.config.dirs.build, environment);

                    await fs.ensureDir(outputDir);

                    logDivider();
                    log(LogLevel.Info, `Creating binary for '${target}'...`);

                    await compile({
                        cwd: this.config.dirs.build,
                        input: path.join(this.config.dirs.temp, `${this.config.shortcut}.js`),
                        output: path.join(outputDir, `${this.config.shortcut}`),
                        targets: [target]
                    });

                    await this.copyFiles(outputDir);
                }
            }
        } catch (e) {
            throw e;
        }
    };

    private async copyFiles(targetDir: string) {
        if (Array.isArray(this.config.copy)) {

            let promises = [];

            for (let copy of this.config.copy) {
                if (await fs.pathExists(copy.from)) {
                    const target = path.join(targetDir, copy.to);

                    promises.push(fs.copy(copy.from, target));
                    log(LogLevel.Info, `File \`${copy.from}\` copied to \`${target}\`.`);
                }
            }

            return Promise.all(promises);
        }
    }

    private checkBuildConfig(pkg: any) {

        const checkDoc = 'Please check documentation in README.MD.';

        if (!has(pkg, 'builder')) {
            throw new Error(`\`builder\` property is missing in \`package.json\`. ${checkDoc}`);
        }

        if (!has(pkg.builder, 'dirs')) {
            throw new Error(`\`builder.dirs\` property is missing in \`package.json\`. ${checkDoc}`);
        }

        if (isEmptyString(pkg.name)) {
            throw new Error(`\`name\` is empty or not a string in \`package.json\`. ${checkDoc}`);
        }

        if (isEmptyString(pkg.version)) {
            throw new Error(`\`version\` is empty or not a string in \`package.json\`. ${checkDoc}`);
        }

        if (isEmptyString(pkg.builder.entry)) {
            throw new Error(`\`builder.entry\` is empty or not a string in \`package.json\`. ${checkDoc}`);
        }

        if (isEmptyString(pkg.builder.node)) {
            throw new Error(`\`builder.node\` is empty or not a string in \`package.json\`. ${checkDoc}`);
        }

        if (isEmptyString(pkg.builder.dirs.build)) {
            throw new Error(`\`builder.dirs.build\` is empty or not a string in \`package.json\`. ${checkDoc}`);
        }

        if (isEmptyString(pkg.builder.dirs.src)) {
            throw new Error(`\`nodeBuilder.dirs.src\` is empty or not a string in \`package.json\`. ${checkDoc}`);
        }
    }

    private async createDockerContainer() {

        if (!has(this.config, 'environments') || !this.config.environments.includes(Environments.Docker)) {
            return;
        }

        const start = Date.now();
        const outputDir = path.join(this.config.dirs.build, 'docker');
        const appPath = path.join(outputDir, `${this.config.shortcut}.js`);
        const image = (has(this.config, "docker.image")) ? this.config.docker.image : 'node:10-alpine';
        const workdir = (has(this.config, "docker.workdir")) ? this.config.docker.workdir : '/usr/src/app';
        const cmd = (has(this.config, "docker.cmd")) ? this.config.docker.cmd : `["node","${this.config.shortcut}.js"]`;

        logDivider();
        log(LogLevel.Info, `Creating 'Docker' container...`);

        await fs.ensureDir(outputDir);

        await fs.copy(path.join(this.config.dirs.temp, `${this.config.shortcut}.js`), appPath);
        log(LogLevel.Info, `App copied to '${appPath}'.`);

        await this.copyFiles(outputDir);

        const dockerfile = path.join(outputDir, `Dockerfile`);
        const dockerfileStream = fs.createWriteStream(dockerfile, {flags: 'w'});

        dockerfileStream.write(`FROM ${image}\n`);
        if (has(this.config, "docker.run")) {
            dockerfileStream.write(`RUN ${this.config.docker.run.join(' \\ \n    && ')} \n`);
        }
        dockerfileStream.write(`WORKDIR "${workdir}"\n`);
        dockerfileStream.write(`COPY . .\n`);
        if (has(this.config, 'docker.ports')) {
            for (const port of this.config.docker.ports) {
                dockerfileStream.write(`EXPOSE ${port.containerPort}\n`);
            }
        }
        dockerfileStream.write(`CMD ${cmd}\n`);
        dockerfileStream.end();

        log(LogLevel.Info, `Dockerfile saved to '${dockerfile}'.`);

        const dockerCompose = path.join(outputDir, `docker-compose.yml`);
        const dockerComposeStream = fs.createWriteStream(dockerCompose, {flags: 'w'});

        dockerComposeStream.write(`version: "3.7"\n`);
        dockerComposeStream.write(`services:\n`);
        dockerComposeStream.write(`  ${this.config.shortcut}:\n`);
        dockerComposeStream.write(`    build: ./\n`);
        dockerComposeStream.write(`    image: ${this.config.shortcut}:${this.config.version}\n`);
        dockerComposeStream.write(`    container_name: ${this.config.shortcut}\n`);
        dockerComposeStream.write(`    restart: ${has(this.config, 'docker.restart') ? this.config.docker.restart : 'always'}\n`);

        if (has(this.config, 'docker.volumes')) {
            dockerComposeStream.write(`    volumes:\n`);
            for (const volume of this.config.docker.volumes) {
                dockerComposeStream.write(`      - ${volume.hostPath}:${volume.servicePath}\n`);
            }
        }

        if (has(this.config, 'docker.ports')) {
            dockerComposeStream.write(`    ports:\n`);
            for (const port of this.config.docker.ports) {
                dockerComposeStream.write(`      - ${port.hostPort}:${port.containerPort}\n`);
            }
        }

        if (has(this.config, "docker.externals")) {
            dockerComposeStream.write(`    external_links:\n`);
            for (const external of this.config.docker.externals) {
                dockerComposeStream.write(`      - ${external}\n`);
            }
        }

        dockerComposeStream.end();

        log(LogLevel.Info, `Docker compose file saved to '${dockerCompose}'.`);
        const end = Date.now();
        log(LogLevel.Ok, `Finished in ${(end - start) / 1000}s`);
    }

    private async createLinuxService() {

        if (!has(this.config, 'environments') || !this.config.environments.includes(Environments.LinuxX64)) {
            return;
        }

        const start = Date.now();
        const execDir = path.join(this.config.dirs.build, `linux-x64`);

        if (!fs.pathExists(execDir)) {
            return;
        }

        logDivider();
        log(LogLevel.Info, `Creating service daemon for 'linux-x64'...`);

        const servicePath = path.join(execDir, 'install');
        const serviceFile = path.join(servicePath, `${this.config.shortcut}.service`);

        await fs.outputFile(serviceFile, '');

        const serviceStream = fs.createWriteStream(serviceFile);

        serviceStream.write(`[Unit]\n`);
        serviceStream.write(`Description=${this.config.shortcut}\n`);
        serviceStream.write(`\n`);
        serviceStream.write(`[Service]\n`);
        serviceStream.write(`ExecStart=/srv/invipo/${this.config.shortcut}/${this.config.shortcut}\n`);
        serviceStream.write(`Restart=always\n`);
        serviceStream.write(`WorkingDirectory=/srv/invipo/${this.config.shortcut}\n`);
        serviceStream.write(`\n`);
        serviceStream.write(`[Install]\n`);
        serviceStream.write(`WantedBy=multi-user.target\n`);
        serviceStream.end();

        log(LogLevel.Info, `Service configuration saved to '${serviceFile}'`);

        const shellFile = path.join(servicePath, `${this.config.shortcut}.sh`);
        const targetDir = `/srv/invipo/${this.config.shortcut}`;

        await fs.outputFile(shellFile, '');
        const shellStream = fs.createWriteStream(shellFile);

        shellStream.write(`mkdir -p ${targetDir}\n`);
        shellStream.write(`chmod 0777 ${targetDir}\n`);
        shellStream.write(`cp ../${this.config.shortcut} ${targetDir}\n`);
        shellStream.write(`cp ./${this.config.shortcut}.service /etc/systemd/system/${this.config.shortcut}.service\n`);
        shellStream.write(`systemctl daemon-reload\n`);
        shellStream.write(`systemctl start ${this.config.shortcut}\n`);
        shellStream.write(`systemctl enable ${this.config.shortcut}\n`);
        shellStream.write(`systemctl status ${this.config.shortcut}\n`);
        shellStream.end();

        log(LogLevel.Info, `Install script saved to '${shellFile}'`);
        const end = Date.now();
        log(LogLevel.Ok, `Finished in ${(end - start) / 1000}s`);
    }

    private async createNodePackage() {

        const start = Date.now();
        const outputDir = path.join(this.config.dirs.build, 'node');
        const appPath = path.join(outputDir, `${this.config.shortcut}.js`);

        logDivider();
        log(LogLevel.Info, `Creating 'Node.js' package...`);

        await fs.ensureDir(outputDir);

        await fs.copy(path.join(this.config.dirs.temp, `${this.config.shortcut}.js`), appPath);
        log(LogLevel.Info, `App copied to '${appPath}'`);

        await this.copyFiles(outputDir);

        const end = Date.now();
        log(LogLevel.Ok, `Finished in ${(end - start) / 1000}s`);
    }

    private async createWinService() {

        if (!has(this.config, 'environments') || !this.config.environments.includes(Environments.WinX64)) {
            return;
        }

        const start = Date.now();
        const winSwPath = path.join(__dirname, `bin/WinSW.NET4.exe`);
        const execDir = path.join(this.config.dirs.build, `windows-x64`);

        if (!fs.pathExists(winSwPath)) {
            return;
        }

        await fs.ensureDir(execDir);

        logDivider();
        log(LogLevel.Info, `Creating service daemon for 'windows-x64'...`);

        const servicePath = path.join(execDir, 'service');
        const serviceExec = path.join(servicePath, `service.exe`);
        const serviceXml = path.join(servicePath, `service.xml`);

        await fs.copy(winSwPath, serviceExec);

        log(LogLevel.Info, `Copied '${winSwPath}' to '${serviceExec}'`);

        const xml = xmlbuilder.create('configuration')
            .ele('id', this.config.shortcut).up()
            .ele('name', this.config.shortcut).up()
            .ele('description', this.config.shortcut).up()
            .ele('executable', `%BASE%/../${this.config.shortcut}.exe`).up()
            .ele('workingdirectory', `%BASE%/..`).up()
            .ele('onfailure', {
                'action': 'restart',
                'delay': '10 sec'
            }).up()
            .ele('onfailure', {
                'action': 'restart',
                'delay': '30 sec'
            }).up()
            .ele('onfailure', {
                'action': 'restart',
                'delay': '1 min'
            }).up()
            .ele('onfailure', {
                'action': 'restart',
                'delay': '2 min'
            }).up()
            .ele('onfailure', {
                'action': 'restart',
                'delay': '3 min'
            }).up()
            .ele('resetfailure', '10 min').up()
            .ele('priority', 'High').up()
            .ele('log', {
                'mode': 'reset'
            }).up()
            .end({pretty: true});

        await fs.outputFile(serviceXml, xml);

        log(LogLevel.Info, `Service configuration saved to '${serviceXml}'`);
        const end = Date.now();
        log(LogLevel.Ok, `Finished in ${(end - start) / 1000}s`);
    };
}
