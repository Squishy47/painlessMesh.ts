import { LogLevel } from "../lib/Logger.ts";
import Mesh from "../lib/Mesh.ts";

const mesh = new Mesh({
    host: "10.176.216.1",
    logLevels: [LogLevel.ERROR, LogLevel.STARTUP, LogLevel.MSG_TYPES],
});

mesh.start();

mesh.on("single", (data) => {
    console.log(data);
});

mesh.on("broadcast", (data) => {
    console.log(data);
});

mesh.on("connected", () => {
    console.log("callback mesh connected");
});

mesh.on("disconnected", () => {
    console.log("callback mesh disconnected");
});
