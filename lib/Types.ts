export enum MeshMsgType {
    TIME_DELAY = 3,
    TIME_SYNC = 4,
    NODE_SYNC_REQUEST = 5,
    NODE_SYNC_REPLY = 6,
    CONTROL = 7, // deprecated
    BROADCAST = 8, // application data for everyone
    SINGLE = 9, // application data for a single node
}

export enum TimeType {
    TIME_SYNC_ERROR = -1,
    TIME_SYNC_REQUEST,
    TIME_REQUEST,
    TIME_REPLY,
}

export type Msg = {
    type: MeshMsgType.BROADCAST | MeshMsgType.SINGLE;
    dest: number;
    from: number;
    msg: string;
    timeReceived: number;
};

export type BroadcastMsg = Msg & {
    type: MeshMsgType.BROADCAST;
};

export type SingleMsg = Msg & {
    type: MeshMsgType.SINGLE;
};

type TimeSyncMsg = {
    type: MeshMsgType.TIME_SYNC;
    dest: number;
    from: number;
};

export type TimeSyncRequestMsg = TimeSyncMsg & {
    msg: {
        type: TimeType.TIME_SYNC_REQUEST;
        t0: number;
    };
};

export type TimeSyncReplyMsg = TimeSyncMsg & {
    msg: {
        type: TimeType.TIME_REPLY;
        t0: number;
        t1: number;
        t2: number;
    };
};

export type NodeSyncItem = {
    nodeId: number;
    root: boolean;
    subs: NodeSyncItem[];
};

type NodeSyncMsg = {
    nodeId: number;
    type: MeshMsgType.NODE_SYNC_REQUEST | MeshMsgType.NODE_SYNC_REPLY;
    dest: number;
    from: number;
    root?: boolean;
    subs: NodeSyncItem[];
};

export type NodeSyncRequestMsg = NodeSyncMsg & {
    type: MeshMsgType.NODE_SYNC_REQUEST;
    dest: 0;
};

export type NodeSyncReplyMsg = NodeSyncMsg & {
    type: MeshMsgType.NODE_SYNC_REPLY;
};

export type onMsgCallbackType =
    | "broadcast"
    | "single"
    | "connected"
    | "disconnected";
