import * as net from "net";

import { Time } from "./Time";
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
import { gateway4sync } from "default-gateway";
import { machineIdSync } from "node-machine-id";
import * as CRC32 from "crc-32";

interface MeshOptions {
    logger?: Logger;
    port?: number;
    host?: string;
    nodeId?: number;
    logLevels?: LogLevel[];
}

export default class Mesh {
    private nodeId: number;
    private port: number;
    private host: string;
    private connected = false;

    private tcpClient = new net.Socket();
    private logger: Logger;
    private singleCallbacks: Array<(data: SingleMsg) => void> = [];
    private broadcastCallbacks: Array<(data: BroadcastMsg) => void> = [];

    private connectedCallbacks: Array<() => void> = [];
    private disconnectedCallbacks: Array<() => void> = [];

    private subs: Map<number, { root: boolean; subs: NodeSyncItem[] }> =
        new Map();
    private timeSyncScheduler: NodeJS.Timeout | undefined;
    private nodeSyncScheduler: NodeJS.Timeout | undefined;

    private time = new Time();

    constructor(opts: MeshOptions) {
        const { gateway } = gateway4sync();

        this.logger = opts?.logger ?? new Logger(opts.logLevels);

        if (!opts.host) {
            this.logger.log(LogLevel.STARTUP, `Gateway: ${gateway}`);
        }

        this.port = opts.port ?? 5555;
        this.host = opts.host ?? gateway;

        this.nodeId = opts?.nodeId ?? this.generateNewNodeId();

        this.logger.log(LogLevel.STARTUP, `Node ID: ${this.nodeId}`);
    }

    private generateNewNodeId(): number {
        const newId = CRC32.str(machineIdSync(true));
        return newId < 0 ? newId * -1 : newId;
    }

    private setConnected(state: boolean) {
        this.connected = state;

        this.logger.log(
            LogLevel.STARTUP,
            `Mesh ${state ? "" : "dis"}connected.`
        );

        if (state) {
            this.connectedCallbacks.forEach((cb) => cb());
        } else {
            this.disconnectedCallbacks.forEach((cb) => cb());
        }
    }

    private processMsg(msg: string) {
        const t1 = this.time.getMicroSeconds();

        let jsonData;

        try {
            jsonData = { ...JSON.parse(msg), timeReceived: t1 };
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
                      t0: this.time.getMicroSeconds(),
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
                      t2: this.time.getMicroSeconds(),
                  },
              };
    }

    private calculateOffset(data: TimeSyncReplyMsg, t3: number) {
        const t0 = data.msg.t0;
        const t1 = data.msg.t1;
        const t2 = data.msg.t2;

        const p1 = (t1 - t0) / 2;
        const p2 = (t2 - t3) / 2;

        this.time.setOffset(p1 + p2);
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

        if (!this.connected) {
            this.setConnected(true);
        }

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

    public start() {
        this.tcpClient.connect(
            {
                port: this.port,
                host: this.host,
                noDelay: true,
            },
            () => {
                this.logger.log(
                    LogLevel.STARTUP,
                    "tcp connection established."
                );
                this.initiateNodeSync();
                this.initiateTimeSync();
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
            this.setConnected(false);
        });

        this.tcpClient.on("error", (err: Error) => {
            this.logger.log(LogLevel.ERROR, err);
            this.setConnected(false);
        });
    }

    public on(msgType: onMsgCallbackType, cb: (data: Msg) => void): void {
        switch (msgType) {
            case "single":
                this.singleCallbacks.push(cb);
                break;
            case "broadcast":
                this.broadcastCallbacks.push(cb);
                break;
            case "connected":
                // @ts-ignore
                this.connectedCallbacks.push(cb);
                break;
            case "disconnected":
                // @ts-ignore
                this.disconnectedCallbacks.push(cb);
                break;
            default:
                throw new Error("Unknown msg type");
        }
    }

    public send(type: onMsgCallbackType, msg: string, dest: number): void {
        if (type === "single" && dest === 0) {
            throw new Error(
                "Cannot send a single message to everyone (dest = 0)"
            );
        }

        if (type === "broadcast") {
            dest = 0;
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
