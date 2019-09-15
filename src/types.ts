export enum Environments {
    LinuxX64 = 'linux-x64',
    WinX64 = 'windows-x64',
    Docker = 'docker'
}

export enum LogLevel {
    Info,
    Ok,
    Error
}

export enum Restart {
    No = "no",
    Always = "always",
    OnFailure = "on-failure",
    UnlessStopped = "unless-stopped",
}

export interface Config {
    name: string;
    shortcut: string;
    version: string;
    dirs: {
        build: string;
        src: string;
        temp?: string;
    };
    node: string;
    entry: string;
    copy?: Array<{
        from: string;
        to: string;
    }>;
    environments?: Environments[];
    docker?: {
        externals?: string[];
        image?: string;
        workdir?: string;
        run?: string[];
        cmd?: string;
        restart?: Restart;
        volumes?: Array<{
            hostPath: string;
            servicePath: string;
        }>;
        ports?: Array<{
            hostPort: number;
            containerPort: number;
        }>
    }
}

export interface Directories {
    build: string;
    src: string;
    temp: string;
}
