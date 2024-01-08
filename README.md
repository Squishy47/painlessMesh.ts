A full typescript implementation of the esp32 lib, painlessMesh, with 0 dependencies.
This might not be a complete implementation but it works on my machine and the other nodes in the network recognise it as a node.

I've dev-ed this using Bun as my perferred ts runtime and tested with tsx, which seems to work fine.

### Basic Example
To run on a normal machine just connect to your mesh's wifi network and populate the host and port values accordingly.
Where host is the value of the network getway and port is the port you set in your esp32 code. default: 5555


```
import { Mesh } from "./src/Mesh";

const mesh = new Mesh({ host: "1.1.1.1", port: 5555 });

mesh.start();

mesh.on("single", (data) => {
    console.log("single", data);
});

mesh.on("broadcast", (data) => {
    console.log("broadcast", data);
});
```

