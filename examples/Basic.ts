import Mesh from "../lib/Mesh.ts";

const mesh = new Mesh({
    host: "10.80.0.1",
    port: 5555,
});

await mesh.start();

mesh.on("broadcast", (data) => {
    console.log(data);
});
