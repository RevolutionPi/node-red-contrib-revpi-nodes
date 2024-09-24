/* node-red-contrib-revpi-nodes
 *
 * Copyright (C) 2019 erminas GmbH
 *
 * This file is subject to the terms and conditions defined in
 * file 'LICENSE.txt', which is part of this source code package.
 */

const WS_PROTOCOL_VERSION = "1.1.0"
var WebSocket = require("ws");
var fs = require('fs');

module.exports = function (url, config) {

    var log = function (msg) {
        if (console) {
			console.log.apply(console, [new Date().toISOString().replace('T', ' ').substr(0, 19)].concat([].slice.call(arguments)));
        }
    };

    var options = {
        url: url || "wss://localhost:8000",
		user: config.user,
		password: config.password,
        rejectUnauthorized: config.rejectUnauthorized,
		getAutomaticUpdates : config.getAutomaticUpdates,
        canReconnect: config.canReconnect || false
    };


	if(config.rejectUnauthorized && config.ca){
		try {
			options.ca = fs.readFileSync(config.ca);
		} catch (err) {
			log("ERROR", "Error reading CA certificate with path "+config.ca+"!");
			options.ca = null;
		}
	}

	var protocols = {rejectUnauthorized: options.rejectUnauthorized};
	var webSocketOptions = { perMessageDeflate: false};

	if(options.ca){
		protocols.ca=options.ca;
	}

    var connection = new WebSocket(options.url,protocols, webSocketOptions);
    var connected = false;

	const loginStates = {"ERROR_AUTH":0,"SUCCESS_AUTH":1, "ERROR_UNSUPPORTED_VERSION":2};
	Object.freeze(loginStates);
	var loginStatus = loginStates.ERROR_AUTH;

    var reconnectAttempts = 0;
    var sendCommandPool = []; // Commands are stored as long as the connection is not established.
    var commandList = ["login","commands", "list", "output", "getpin"];
    var isReconnect = false;
    var inputNodes = {};
	var multiInputNodes = {};
    var getpinNodes = {};
    var outputNodes = {};

    var sendCommandMethod = null;

    var getStatusObject = function (status, text) {
        var statusObject = null;
        switch (status) {
            case "success":
                statusObject = {fill: "green", shape: "ring", text: (text || "")};
                break;
            case "error":
                statusObject = {fill: "red", shape: "ring", text: (text || "")};
                break;
            case "info":
            default:
                statusObject = {fill: "blue", shape: "dot", text: (text || "")};
        }
        return statusObject;
    };


	var setAllNodesStatus = function (status, text) {
		[].concat(
			Object.values(multiInputNodes),
			Object.values(inputNodes),
			Object.values(getpinNodes),
			Object.values(outputNodes)
		).forEach((node) => {
			node.status(getStatusObject(status, text));
		});

	};

    // input command is allways there to communicate the input back to nodered
    var sendCommandStorage = {
        "input": [function (msg) {
			data = JSON.parse(msg);

			if (data !== false)
			{
				if (data.error !== "ERROR_AUTH" && data.error !== "ERROR_UNKNOWN" ) {
					var pin = data.name, value = data.value, id;
					for (id in inputNodes) {
						if (!inputNodes.hasOwnProperty(id)) continue;

						if (inputNodes[id].inputpin === pin){
							var setTopic = (inputNodes[id].topic == null || inputNodes[id].topic == "") ? "revpi/single/"+pin : inputNodes[id].topic;

							inputNodes[id].send({payload: value, topic: setTopic});
							inputNodes[id].status(getStatusObject("info", "Change - " + pin + " is " + value));
						}
					}

					for (id in multiInputNodes) {
						if (!multiInputNodes.hasOwnProperty(id)) continue;

						var pins = multiInputNodes[id].inputpin.split(" "), promises = [];
						if (pins.indexOf(pin) !== -1) {
							promises.push(Promise.resolve(multiInputNodes[id]));
							promises.push(Promise.resolve(data));

							pins.filter(a => a !== pin).forEach(otherPin => {
								promises.push(new Promise((resolve) => {
									var pinValue = {
										name: otherPin,
										value: multiInputNodes[id].inputValues[otherPin]
									}
									resolve(pinValue);
								}));
							});

							Promise.all(promises).then(values => {
								var node = values.shift();
								var payloadJSONObj = {};
								values.forEach(valPair => {
									payloadJSONObj[valPair.name] = valPair.value;
								});
								multiInputNodes[id].inputValues[pin] = payloadJSONObj[pin];

								var setTopic = (node.topic == null || node.topic == "") ? "revpi/multi" : node.topic;

								node.send({payload: payloadJSONObj, topic: setTopic});
								node.status(getStatusObject("info", "Received value(s)"));
							}).catch((msg) => {
								for (id in inputNodes) {
									if (!inputNodes.hasOwnProperty(id)) continue;

									if (inputNodes[id].inputpin === msg[0]){
										inputNodes[id].status(getStatusObject("error", msg[1]));
									}
								}
							});
						}
					}
				}
			}
        }]
    };

    var reconnect = function() {
		if(options.canReconnect){
			isReconnect = true;
			if (connected === false) {
				if (reconnectAttempts < 10) {
					reconnectAttempts++;
					log("Try to reconnect - Attempt: " + reconnectAttempts);

					var protocols = {rejectUnauthorized: options.rejectUnauthorized};

					if(options.ca){
						protocols.ca=options.ca;
					}

					setAllNodesStatus("error", "Reconnecting...");

					connection.close();
					connection = new WebSocket(options.url, protocols, webSocketOptions);
					connectToServer();
					isReconnect = false;
				} else {
					log("Stopped reconnecting. Max Reconnections reached!");
				}
			} else {
				reconnectAttempts = 0;
			}
		}
    }

    var connectToServer = function (cb) {
        log("Connecting to WS Server " + url);
        var that = this;

		var canReconnect = options.canReconnect;

        connection.onerror = function (ErrorEvent) {
            var me = that;
            log("ERROR", "Connection to server "+url+" error: " +ErrorEvent.message);

			if(cb){
				cb();
			}
        };

        connection.onopen = function (data) {
			connected = true;
            log("Connection to WS Server "+url+" established!");
            reconnectAttempts = 0;
            isReconnect = false;

			var inputPins = [];

			for (id in inputNodes) {
				if (!inputNodes.hasOwnProperty(id)) continue;

				inputPins.push(inputNodes[id].inputpin);
			}

			for (id in multiInputNodes) {
				if (!multiInputNodes.hasOwnProperty(id)) continue;

				inputPins = inputPins.concat(multiInputNodes[id].inputpin.split(" "));
			}

			for (id in getpinNodes) {
				if (!getpinNodes.hasOwnProperty(id)) continue;

				inputPins.push(getpinNodes[id].inputpin);
			}


			sendCommandMethod("login", function (msg) {
				data = JSON.parse(msg);

				if (data !== false)
				{
					if (data.error === "ERROR_AUTH") {
						log("error", "Error not authorized by server!");
						loginStatus=loginStates.ERROR_AUTH;
					    setAllNodesStatus("error", "NOT AUTHORIZED");
					}else if(data.error === "ERROR_UNSUPPORTED_VERSION") {
						log("error", "Unsupported server version!");
						loginStatus=loginStates.ERROR_UNSUPPORTED_VERSION;
						setAllNodesStatus("error", "UNSUPPORTED SERVER");
					}else{
						log("info", "Authorized by server!");
						loginStatus=loginStates.SUCCESS_AUTH;
                        setAllNodesStatus("success", "Connected");

						var list = sendCommandPool;
						sendCommandPool = {};
						for (var command in list) {

							for (var i = 0, l = list[command].length; i < l; ++i) {
								sendCommandStorage[command].push(list[command][i]);
							}
							connection.send(command, undefined, undefined);
						}

					}
				}

				if(cb){
					cb();
				}
			}, [WS_PROTOCOL_VERSION,options.user,options.password,options.getAutomaticUpdates, inputPins]);

        };

        connection.onmessage = function (data) {
            var msg = data.data;
            var msgSplit = msg.split(";");
            var fullCommand = msgSplit.shift();

            var newMsg = msgSplit.join(";");
            if (sendCommandStorage[fullCommand]) {
                sendCommandStorage[fullCommand].forEach((callBack) => {
                    callBack.apply({}, (newMsg + "#" + fullCommand).split("#"));
                })
                if (fullCommand !== "input") {
                    sendCommandStorage[fullCommand] = [];
                }
            }
        };

        connection.onclose = function () {
            connected = false;
            log("Lost connection to WS Server!");

			setAllNodesStatus("error", "Disconnected");
            if (isReconnect === false && canReconnect) {
                setTimeout(function () {
                    reconnect();
                }, 5000);
            }
       };
    };


    this.sendCommand = sendCommandMethod = function (command, cb, args) {
		if (commandList.indexOf(command) !== -1 || command === "") {
			if (command !== "") {
				command = command + "#" + JSON.stringify(args);
			}
			if (typeof (sendCommandStorage[command]) == "undefined") {
				sendCommandStorage[command] = [];
			}
			if (connected === false) {
				if (typeof (sendCommandPool[command]) === "undefined") {
					sendCommandPool[command] = [];
				}
				sendCommandPool[command].push(cb);
			} else {
				sendCommandStorage[command].push(cb);
				connection.send(command);
			}
		}
    };

    this.connect = function (cb) {
        if (connected === false) {
            connectToServer(cb);
        }
        return this;
    };

    this.isConnected = function () {
        return connected;
    };

	this.isAuthorized = function () {
        return loginStatus === loginStates.SUCCESS_AUTH;
    };

	this.isUnsupportedServer = function () {
        return loginStatus === loginStates.ERROR_UNSUPPORTED_VERSION;
    };

    this.isOption = function (key) {
        return (typeof (options[key]) != "undefined");
    };

    this.setOption = function (key, val) {
        if (this.isOption(key)) {
            options[key] = val;
            return this;
        }
        log('Unknown Option "' + key + '"');
        return this;
    };
    this.getOption = function (key) {
        if (this.isOption(key)) {
            return options[key];
        }
        log('Unknown Option "' + key + '"');
        return this;
    };

    this.registerInput = function (node) {
        node.getStatusObject = getStatusObject;
        inputNodes[node.id] = node;
		node.status(getStatusObject("error", "Connecting..."));
    };

    this.registerMultiInput = function (node) {
        node.getStatusObject = getStatusObject;
        multiInputNodes[node.id] = node;
		node.status(getStatusObject("error", "Connecting..."));
    };

    this.registerGetpin = function (node) {
        node.getStatusObject = getStatusObject;
        getpinNodes[node.id] = node;
		node.status(getStatusObject("error", "Connecting..."));
    };

    this.registerOutput = function (node) {
        node.getStatusObject = getStatusObject;
        outputNodes[node.id] = node;
		node.status(getStatusObject("error", "Connecting..."));
    };



    this.kill = killMethod = function () {
		options.canReconnect = false;
        connection.onclose = function () {}; // disable onclose handler first
        connection.close();
    };

};

