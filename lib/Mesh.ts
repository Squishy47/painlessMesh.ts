import net from "net";
import { getMicroSeconds } from "./Time";
import { LogLevel, Logger } from "./Logger";
import {
    MeshMsgType,
    type SingleMsg,
    type BroadcastMsg,
    type onMsgCallbackType,
    type TimeSyncRequestMsg,
    type TimeSyncReplyMsg,
    TimeType,
    type NodeSyncRequestMsg,
    type NodeSyncReplyMsg,
    type NodeSyncItem,
    type Msg,
} from "./Types";

interface MeshOptions {
    logger?: Logger;
    port: number;
    host: string;
    nodeId?: number;
    logLevels?: LogLevel[];
}

export default class Mesh {
    private nodeId: number;
    private port: number;
    private host: string;

    private tcpClient = new net.Socket();

    private logger: Logger;

    private singleCallbacks: Array<(data: SingleMsg) => void> = [];
    private broadcastCallbacks: Array<(data: BroadcastMsg) => void> = [];

    private subs: Map<number, { root: boolean; subs: NodeSyncItem[] }> =
        new Map();

    private timeSyncScheduler: NodeJS.Timeout | undefined;
    private nodeSyncScheduler: NodeJS.Timeout | undefined;

    constructor(opts: MeshOptions) {
        this.logger = opts?.logger ?? new Logger(opts.logLevels);
        this.port = opts.port;
        this.host = opts.host;

        this.nodeId = opts?.nodeId ?? Mesh.generateNewNodeId();
    }

    static generateNewNodeId(): number {
        let output = "";
        while (output.length < 10) {
            const temp = Math.floor(Math.random() * 10);
            if (temp === 0) continue;
            output += temp;
        }

        // static method so we don't have a logger instance available
        console.log(`Generated new nodeId: ${output}`);

        return parseInt(output);
    }

    public async start(): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            this.tcpClient.connect(
                {
                    port: this.port,
                    host: this.host,
                    noDelay: true,
                },
                () => {
                    this.logger.log(LogLevel.STARTUP, "Mesh Connected");
                    this.initiateNodeSync();
                    this.initiateTimeSync();

                    resolve(true);
                }
            );

            this.tcpClient.on("data", (data: Buffer) => {
                const stringDataWithoutEnding = data.toString().split("\u0000");

                stringDataWithoutEnding.forEach((msg) => {
                    if (!msg) return;

                    this.processMsg(msg.replaceAll("\0", ""));
                });
            });

            this.tcpClient.on("close", () => {
                this.logger.log(LogLevel.STARTUP, "Mesh Connection closed.");
            });

            this.tcpClient.on("error", (err) => {
                this.logger.log(LogLevel.ERROR, err);
                reject(false);
            });
        });
    }

    private processMsg(msg: string) {
        const t1 = getMicroSeconds();

        let jsonData;

        try {
            jsonData = JSON.parse(msg);
        } catch (e) {
            this.logger.log(LogLevel.GENERAL, e);
            this.logger.log(LogLevel.GENERAL, msg);
            return;
        }

        let responseMsg = undefined;

        switch (jsonData.type) {
            case MeshMsgType.NODE_SYNC_REQUEST:
                responseMsg = this.processNodeSyncRequest(jsonData);
                break;
            case MeshMsgType.NODE_SYNC_REPLY:
                responseMsg = this.processNodeSyncReply(jsonData);
                break;
            case MeshMsgType.TIME_SYNC:
                responseMsg = this.processTimeSync(jsonData, t1);
                break;
            case MeshMsgType.BROADCAST:
                this.processBroadcast(jsonData);
                break;
            case MeshMsgType.SINGLE:
                this.processSingle(jsonData);
                break;
        }

        if (responseMsg === undefined) {
            return;
        }

        const res = Buffer.from(JSON.stringify(responseMsg) + "\0");

        this.tcpClient.write(res);
    }

    private processTimeSync(
        data: TimeSyncRequestMsg,
        t1: number
    ): TimeSyncReplyMsg | TimeSyncRequestMsg {
        this.logger.log(LogLevel.GENERAL, "Processing time sync");

        return data.msg.type === 0
            ? {
                  type: MeshMsgType.TIME_SYNC,
                  dest: data.from,
                  from: this.nodeId,
                  msg: {
                      type: TimeType.TIME_SYNC_REQUEST,
                      t0: getMicroSeconds(),
                  },
              }
            : {
                  type: MeshMsgType.TIME_SYNC,
                  dest: data.from,
                  from: this.nodeId,
                  msg: {
                      type: TimeType.TIME_REPLY,
                      t0: data.msg.t0 ?? 0,
                      t1,
                      t2: getMicroSeconds(),
                  },
              };
    }

    private initiateTimeSync() {
        this.logger.log(LogLevel.GENERAL, "initiating time sync");

        clearTimeout(this.timeSyncScheduler);

        const res = {
            type: MeshMsgType.TIME_SYNC,
            dest: 0,
            from: this.nodeId,
            msg: {
                type: TimeType.TIME_REQUEST,
            },
        };
        this.write(res);

        const random35PercentOf10Minutes = Math.floor(
            (Math.random() * 2 - 1) * 1000 * 60 * 10 * 0.35
        );

        const timeout = 1000 * 60 * 10 + random35PercentOf10Minutes;

        this.timeSyncScheduler = setTimeout(() => {
            this.initiateTimeSync();
        }, timeout); // every 10 minutes +- 35%
    }

    private initiateNodeSync() {
        this.logger.log(LogLevel.GENERAL, "initiating node sync");

        clearTimeout(this.nodeSyncScheduler);

        this.write({
            type: MeshMsgType.NODE_SYNC_REQUEST,
            dest: 0,
            from: this.nodeId,
        });
        const random35PercentOf3Minutes = Math.floor(
            (Math.random() * 2 - 1) * 1000 * 60 * 3 * 0.35
        );

        const timeout = 1000 * 60 * 3 + random35PercentOf3Minutes;

        this.nodeSyncScheduler = setTimeout(() => {
            this.initiateNodeSync();
        }, timeout); // every 3 minutes +- 35%
    }

    private processNodeSyncReply(data: NodeSyncReplyMsg) {
        this.logger.log(LogLevel.GENERAL, "Processing node sync reply.");

        this.subs.set(data.nodeId, {
            root: data.root ?? false,
            subs: data.subs,
        });
    }

    private write(data: any) {
        this.tcpClient.write(JSON.stringify(data) + "\0");
    }

    private processNodeSyncRequest(data: NodeSyncRequestMsg): NodeSyncReplyMsg {
        this.logger.log(LogLevel.GENERAL, "Processing node sync request.");

        const subs = Array.from(this.subs, (entry) => ({
            nodeId: entry[0],
            ...entry[1],
        }));

        return {
            type: MeshMsgType.NODE_SYNC_REPLY,
            nodeId: this.nodeId,
            dest: data.from,
            from: this.nodeId,
            subs: subs.filter((sub) => sub.nodeId !== data.from),
        };
    }

    private processSingle(data: SingleMsg) {
        this.logger.log(LogLevel.DEBUG, "Processing single.");

        if (data.dest !== this.nodeId) return;

        this.singleCallbacks.forEach((cb) => cb(data));
    }

    private processBroadcast(data: BroadcastMsg) {
        this.logger.log(LogLevel.DEBUG, "Processing broadcast");

        this.broadcastCallbacks.forEach((cb) => cb(data));
    }

    on(msgType: onMsgCallbackType, cb: (data: Msg) => void): void {
        if (msgType === "single") {
            this.singleCallbacks.push(cb);
        } else {
            this.broadcastCallbacks.push(cb);
        }
    }

    send(type: onMsgCallbackType, msg: string, dest: number): void {
        if (type === "single" && dest === 0) {
            throw new Error(
                "Cannot send a single message to everyone (dest = 0)"
            );
        }

        const res = {
            type:
                type === "single" ? MeshMsgType.SINGLE : MeshMsgType.BROADCAST,
            dest: dest,
            from: this.nodeId,
            msg,
        };

        this.tcpClient.write(JSON.stringify(res) + "\0");
    }
}
