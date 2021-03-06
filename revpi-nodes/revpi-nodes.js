/* node-red-contrib-revpi-nodes
 *
 * Copyright (C) 2019 erminas GmbH
 *
 * This file is subject to the terms and conditions defined in
 * file 'LICENSE.txt', which is part of this source code package.
 */
 
var websockets = {};
var socketClass = require("./libs/socket.js");

function createWebsocket(host, port) {
    var url = "ws://" + host + ":" + port;
    var socket = new socketClass(url);
    socket.connect();
    websockets[url] = socket;
    return socket;
}

function getWebsocket(host, port) {
    var url = "ws://" + host + ":" + port;
    return websockets[url];
}

function removeWebsocket(host, port) {
    var url = "ws://" + host + ":" + port;
    var socket = getWebsocket(host, port);
    if (socket) {
        socket.kill();
        delete websockets[url];
    }
}

module.exports = function (RED) {
    function RevpiServer(config) {
        RED.nodes.createNode(this, config, undefined);
        this.host = config.host;
        this.port = config.port;
        this.socket = createWebsocket(config.host, config.port);

        var node = this;
        this.on("close", function (removed, done) {
            removeWebsocket(node.host, node.port);
            this.socket.kill(done);
        });

    }

    RED.nodes.registerType("revpi-server", RevpiServer);

    function RevpiSingleInput(config) {
        RED.nodes.createNode(this, config, undefined);
        this.server = RED.nodes.getNode(config.server);
        this.inputpin = config.inputpin;

        if (this.server) {
            this.server.socket.registerInput(this);
            this.status(((this.server.socket.isConnected() === false) ? this.getStatusObject("error", "Disconnected") : this.getStatusObject("success", "Connected")));

            var node = this;
            this.server.socket.sendCommand("getpin", function (msg) {
				data = JSON.parse(msg);
				
				if (data !== false)
				{
					var pin = data.name, value = data.value;
					if (value === "ERROR_UNKNOWN") {
						node.status(node.getStatusObject("error", "UNKNOWN PIN: " + pin + "!"));
					} else {
						node.send({payload: value, topic: "revpi/single/"+pin});
					}
				}
            }, [this.inputpin]);
        }
    }

    RED.nodes.registerType("revpi-single-input", RevpiSingleInput);

    function RevpiMultipleInput(config) {
        RED.nodes.createNode(this, config, undefined);
        this.server = RED.nodes.getNode(config.server);
        this.inputpin = config.inputpin;
        if (this.server) {
            this.server.socket.registerMultiInput(this);
            this.status(((this.server.socket.isConnected() === false) ? this.getStatusObject("error", "Disconnected") : this.getStatusObject("success", "Connected")));

            var node = this, promises = [];
            var pinNames = this.inputpin.split(" ").forEach(pinName => {
                promises.push(new Promise((resolve, reject) => {
                    this.server.socket.sendCommand("getpin", function (msg) {
						data = JSON.parse(msg);
				
						if (data !== false)
						{
							var pin = data.name, value = data.value;
							if (value === "ERROR_UNKNOWN") {
								reject(pin);
							} else {
								resolve(data);
							}
						}
							
                    }, [pinName]);
                }));
            });
			
            Promise.all(promises).then(values => {
                var payloadJSONObj = {};
                values.forEach(valPair => {
                    payloadJSONObj[valPair.name] = valPair.value;
                });
                node.send({payload: payloadJSONObj, topic: "revpi/multi"});
            }).catch(pin => {
                node.status(node.getStatusObject("error", "UNKNOWN PIN: " + pin + "!"));
            });

        }
    }

    RED.nodes.registerType("revpi-multiple-input", RevpiMultipleInput);

    function RevpiGetpin(config) {
        RED.nodes.createNode(this, config, undefined);
        this.server = RED.nodes.getNode(config.server);
        this.inputpin = config.inputpin;
        this.getoverwritevalue = config.getoverwritevalue;

        if (this.server) {
            this.server.socket.registerGetpin(this);
            this.status(((this.server.socket.isConnected() === false) ? this.getStatusObject("error", "Disconnected") : this.getStatusObject("info", "Connected")));
        }

        this.on("input", function (msg) {
            var pinName = this.getoverwritevalue ? msg.payload : this.inputpin, node = this;
            if (this.server && pinName != null) {
                this.server.socket.sendCommand("getpin", function (msg) {
					data = JSON.parse(msg);
				
					if (data !== false)
					{
						var pin = data.name, value = data.value;
						if (value === "ERROR_UNKNOWN") {
							node.status(node.getStatusObject("error", "UNKNOWN PIN: " + pin + "!"));
						} else {
							node.status(node.getStatusObject("info", "Connected - " + pin + " is " + value));
							node.send({payload: value, topic: "revpi/single/"+pin});
						}
					}
                }, [pinName]);
            }
        })
    }

    RED.nodes.registerType("revpi-getpin", RevpiGetpin);

    function RevpiOutput(config) {
        RED.nodes.createNode(this, config, undefined);
        this.server = RED.nodes.getNode(config.server);
        this.outputpin = config.outputpin;
        this.outputvalue = config.outputvalue;
        this.overwritevalue = config.overwritevalue;

        if (this.server) {
            this.server.socket.registerOutput(this);
            this.status(((this.server.socket.isConnected() === false) ? this.getStatusObject("error", "Disconnected") : this.getStatusObject("info", "Connected")));
        }

        this.on("input", function (msg) {
            var val = this.overwritevalue ? this.outputvalue : msg.payload;
            var node = this;
            if (this.server && val !== null && typeof (val) !== "object") {
                this.server.socket.sendCommand("output", function (msgAdditional) {
					if (msgAdditional !== "ERROR_UNKNOWN") {
						node.status(node.getStatusObject("info", "Change - " + node.outputpin + " is " + val));
					} else {
						node.status(node.getStatusObject("info", "Error setting " + node.outputpin + " to " + val));
					}
                }, [this.outputpin, val]);
            }
        });
    }

    RED.nodes.registerType("revpi-output", RevpiOutput);


    RED.httpAdmin.get("/revpi-server-list-pins/:host/:port/:force_update", RED.auth.needsPermission("revpi-server.read"), function (req, res) {
        var result = res;
        if (req.params.host && req.params.port && (req.params.host + "").length > 1) {
            var socket = getWebsocket(req.params.host, req.params.port);
            var isTemp = true;
            if (socket) {
                isTemp = false;
            } else {
                //temp create connection
                socket = createWebsocket(req.params.host, req.params.port);
                socket.setOption("canReconnect", false);
            }
            socket.sendCommand("list", function (res) {
                result.json(res);
                if (isTemp) {
                    removeWebsocket(req.params.host, req.params.port);
                }
            }, [req.params.force_update]);
        } else {
            result.json(false);
        }
    });
}
