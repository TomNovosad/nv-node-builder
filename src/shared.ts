import { LogLevel } from "./types";
import chalk from "chalk";

export const log = (level: LogLevel, message: string): void => {

    let lvl: string;
    let msg: string;

    switch (level) {
        case LogLevel.Error:
            lvl = chalk.red.bold('X');
            msg = chalk.red.bold(message);
            break;
        case LogLevel.Info:
            lvl = chalk.blue('i');
            msg = chalk.blue(message);
            break;
        case LogLevel.Ok:
            lvl = chalk.green('√');
            msg = chalk.green(message);
            break;
    }
    console.info(lvl + ' ' + msg);
};

export const logDivider = (): void => {
    console.log(chalk.bold('-----------------------------------------------------------------------'));
};

export const isEmptyString = (str: any): boolean => {

    if (typeof str !== 'string') {
        return true;
    }

    if (str === undefined || str === null) {
        return true;
    }

    if (str.length > 0) {
        return false;
    }
}
