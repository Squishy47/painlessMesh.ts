import { Mesh } from "./src/Mesh";

const mesh = new Mesh({ host: "1.1.1.1", port: 5555 });

mesh.start();

mesh.on("single", (data) => {
    console.log("single", data);
});

mesh.on("broadcast", (data) => {
    console.log("broadcast", data);
});
