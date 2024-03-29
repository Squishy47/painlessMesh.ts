export enum LogLevel {
    ERROR = 1 << 0,
    STARTUP = 1 << 1,
    MESH_STATUS = 1 << 2,
    CONNECTION = 1 << 3,
    SYNC = 1 << 4,
    S_TIME = 1 << 5,
    COMMUNICATION = 1 << 6,
    GENERAL = 1 << 7,
    MSG_TYPES = 1 << 8,
    REMOTE = 1 << 9, // not yet implemented
    APPLICATION = 1 << 10,
    DEBUG = 1 << 11,
}

export class Logger {
    levels: LogLevel[];

    constructor(level: LogLevel[] = [LogLevel.ERROR]) {
        this.levels = level;
    }

    setLogLevel(levels: LogLevel[]) {
        console.log(`Log levels set`);
        this.levels = levels;
    }

    log(level: LogLevel, msg: any) {
        if (this.levels.includes(level)) {
            console.log(`[${LogLevel[level]}]:`, msg);
        }
    }
}
