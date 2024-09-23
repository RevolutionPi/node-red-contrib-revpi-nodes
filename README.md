Official Revolution Pi Nodes
------

This module provides a set of nodes in [Node-RED](https://nodered.org/) to read and write to I/O Pins of your [Revolution Pi](https://revolution.kunbus.de/).

## Installation on a Revolution Pi

On a Revolution Pi with Debian Bullseye or newer everything is already 
preinstalled with the default image. You can just start the preinstalled 
Node-RED and use the nodes.

## Installation on a remote instance of Node-RED

You can use a remove instance of Node-RED and install the nodes to get 
access to the IOs of the Revolution Pi via remote connection.

### Requirements on Revolution Pi

Install the required backend server on the Revolution Pi via apt:

[noderedrevpinodes-server]
(https://gitlab.com/revolutionpi/noderedrevpinodes-server) .

```
sudo apt install noderedrevpinodes-server
```

> On Bullseye and newer the server is already preinstalled in the default image.

### Installation (on remote Host)
Install the nodes via the [node-red-contrib-revpi-nodes package](https://flows.nodered.org/node/node-red-contrib-revpi-nodes) in the Node-RED Library.

## How to use
1. Make sure the required server is running on any RevPi.
2. Open Node-RED in your browser.
3. Now drag one of the new RevPi nodes into your flow.
4. Double click the node to edit it.
5. Click on the plus icon next to "Server" and set your host and the port 8000.
   > If you're using the server on the same RevPi as Node-RED, you can use 
   > "localhost" for the host. Otherwise type in the IP Address of the RevPi.
6. Click add.
7. The server ist now selected and you can choose an IO from the list.
8. Click done and connect other nodes with your RevPi Node. After that, 
   click Deploay.

### Example flow

![Missing image: please import example flow directly][flow]

[flow]: https://gitlab.com/revolutionpi/node-red-contrib-revpi-nodes/-/raw/e7dcf22ad6a7217dc271465d5d26e26e84dd97de/revpi-nodes/examples/example_flow.png "RevPi Nodes Example Flow"

[Import](https://nodered.org/docs/user-guide/editor/workspace/import-export) the following example flow:
```
[
    {
        "id": "dfa02643ba409524",
        "type": "tab",
        "label": "RevPi example",
        "disabled": false,
        "info": "",
        "env": []
    },
    {
        "id": "36f6c682206523dd",
        "type": "revpi-single-input",
        "z": "dfa02643ba409524",
        "server": "f4b7fb000697da3a",
        "inputpin": "Core_Temperature",
        "topic": "",
        "x": 340,
        "y": 220,
        "wires": [
            [
                "38fcdda6951e5e42"
            ]
        ]
    },
    {
        "id": "e4057e7a0c54a818",
        "type": "revpi-getpin",
        "z": "dfa02643ba409524",
        "server": "f4b7fb000697da3a",
        "getoverwritevalue": true,
        "inputpin": "Core_Frequency",
        "topic": "",
        "x": 350,
        "y": 340,
        "wires": [
            [
                "38fcdda6951e5e42"
            ]
        ]
    },
    {
        "id": "65f7c1791a2c112c",
        "type": "revpi-output",
        "z": "dfa02643ba409524",
        "server": "f4b7fb000697da3a",
        "outputpin": "O_1",
        "overwritevalue": false,
        "outputvalue": "",
        "x": 580,
        "y": 480,
        "wires": []
    },
    {
        "id": "38fcdda6951e5e42",
        "type": "debug",
        "z": "dfa02643ba409524",
        "name": "",
        "active": true,
        "tosidebar": true,
        "console": false,
        "tostatus": false,
        "complete": "payload",
        "targetType": "msg",
        "statusVal": "",
        "statusType": "auto",
        "x": 590,
        "y": 280,
        "wires": []
    },
    {
        "id": "2a210f36920d0fc1",
        "type": "revpi-multiple-input",
        "z": "dfa02643ba409524",
        "server": "f4b7fb000697da3a",
        "inputPinList": "Core_Frequency RevPiIOCycle",
        "inputpin": "Core_Frequency RevPiIOCycle",
        "topic": "",
        "x": 280,
        "y": 280,
        "wires": [
            [
                "38fcdda6951e5e42"
            ]
        ]
    },
    {
        "id": "cc48b4a4e3a5e18c",
        "type": "inject",
        "z": "dfa02643ba409524",
        "name": "",
        "props": [
            {
                "p": "payload"
            }
        ],
        "repeat": "",
        "crontab": "",
        "once": false,
        "onceDelay": 0.1,
        "topic": "",
        "payload": "I_1",
        "payloadType": "str",
        "x": 190,
        "y": 340,
        "wires": [
            [
                "e4057e7a0c54a818"
            ]
        ]
    },
    {
        "id": "d74985ec2a94bfe1",
        "type": "inject",
        "z": "dfa02643ba409524",
        "name": "",
        "props": [
            {
                "p": "payload"
            }
        ],
        "repeat": "",
        "crontab": "",
        "once": false,
        "onceDelay": 0.1,
        "topic": "",
        "payload": "0",
        "payloadType": "str",
        "x": 370,
        "y": 500,
        "wires": [
            [
                "65f7c1791a2c112c"
            ]
        ]
    },
    {
        "id": "07ba61c78332190e",
        "type": "inject",
        "z": "dfa02643ba409524",
        "name": "",
        "props": [
            {
                "p": "payload"
            }
        ],
        "repeat": "",
        "crontab": "",
        "once": false,
        "onceDelay": 0.1,
        "topic": "",
        "payload": "1",
        "payloadType": "str",
        "x": 370,
        "y": 460,
        "wires": [
            [
                "65f7c1791a2c112c"
            ]
        ]
    },
    {
        "id": "c2753c3979d2801d",
        "type": "comment",
        "z": "dfa02643ba409524",
        "name": "Read inputs",
        "info": "",
        "x": 150,
        "y": 180,
        "wires": []
    },
    {
        "id": "f11a52f4a00d9698",
        "type": "comment",
        "z": "dfa02643ba409524",
        "name": "Write outputs",
        "info": "",
        "x": 150,
        "y": 420,
        "wires": []
    },
    {
        "id": "f4b7fb000697da3a",
        "type": "revpi-server",
        "host": "localhost",
        "port": "8000",
        "user": "",
        "password": "",
        "rejectUnauthorized": false,
        "ca": ""
    }
]
```
