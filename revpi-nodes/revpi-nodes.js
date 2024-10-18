/* node-red-contrib-revpi-nodes
 *
 * Copyright (C) 2019 erminas GmbH
 *
 * This file is subject to the terms and conditions defined in
 * file 'LICENSE.txt', which is part of this source code package.
 */

var socketClass = require("./libs/socket.js");
var fs = require('fs');

var log = function (msg) {
	if (console) {
		console.log.apply(console, [new Date().toISOString().replace('T', ' ').substr(0, 19)].concat([].slice.call(arguments)));
	}
};

function createWebsocket(config, callback) {
    var url = "wss://" + config.host + ":" + config.port;

	var socket = new socketClass(url, config);
	socket.connect(callback);

	return socket;
}

function removeWebsocket(socket) {
    socket.kill();
}

module.exports = function (RED) {
    function RevpiServer(config) {
        RED.nodes.createNode(this, config, undefined);
        this.host = config.host;
        this.port = config.port;


		this.socketConfig={
			host: config.host,
			port: config.port,
			user: config.user ? config.user : "",
			password: config.password ? config.password : "",
			rejectUnauthorized: config.rejectUnauthorized ? config.rejectUnauthorized : false,
			getAutomaticUpdates : 'True',
			ca: config.ca || "" ,
			canReconnect: true
		}

        var node = this;

        this.socket = createWebsocket(this.socketConfig,function () {
			if(node.socket.isAuthorized()){
				log("Connected server "+node.host+":"+node.port);
			}
		});


		if(config.ca && !fs.existsSync(config.ca)){
			node.error("CA certificate with path "+config.ca+" not found!");
		}

        this.on("close", function (removed, done) {
            removeWebsocket(node.socket);
			if (done) {
				setTimeout(done, 1);
			}
        });

    }

    RED.nodes.registerType("revpi-server", RevpiServer);

    function RevpiSingleInput(config) {
        RED.nodes.createNode(this, config, undefined);
        this.server = RED.nodes.getNode(config.server);
        this.inputpin = config.inputpin;
        this.topic = config.topic;

        if (this.server) {
			this.server.socket.registerInput(this);
            var node = this;

			this.server.socket.sendCommand("getpin", function (msg) {
				var data = JSON.parse(msg);

				if (data !== false)
				{
					var pin = data.name, value = data.value, error = data.error;

					if (error === "ERROR_AUTH"){
						node.status(node.getStatusObject("error", "NOT AUTHORIZED"));
					}else if (error === "ERROR_UNKNOWN"){
						node.status(node.getStatusObject("error", "UNKNOWN ERROR"));
					}else if (error === "ERROR_PIN") {
						node.status(node.getStatusObject("error", "UNKNOWN PIN: " + pin + "!"));
					}else{
						var setTopic = (node.topic == null || node.topic == "") ? "revpi/single/" + pin : node.topic;
						node.send({payload: value, topic: setTopic});
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
        this.inputValues = {};
        this.topic = config.topic;

        if (this.server) {
			this.server.socket.registerMultiInput(this);
            var node = this, promises = [];

			var pinNames = this.inputpin.split(" ").forEach(pinName => {
				promises.push(new Promise((resolve, reject) => {
					this.server.socket.sendCommand("getpin", function (msg) {
						var data = JSON.parse(msg);

						if (data !== false)
						{
							var pin = data.name, value = data.value, error = data.error;

							if (error === "ERROR_AUTH"){
								reject("NOT AUTHORIZED");
							}else if (error === "ERROR_UNKNOWN") {
								reject("UNKNOWN ERROR");
							}else if(error === "ERROR_PIN"){
								reject("UNKNOWN PIN: " + pin + "!");
							}else{
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

				var setTopic = (node.topic == null || node.topic == "") ? "revpi/multi" : node.topic;
				this.inputValues = payloadJSONObj;
				node.send({payload: payloadJSONObj, topic: setTopic});
			}).catch(msg => {
				node.status(node.getStatusObject("error", msg));
			});
        }
    }

    RED.nodes.registerType("revpi-multiple-input", RevpiMultipleInput);

    function RevpiGetpin(config) {
        RED.nodes.createNode(this, config, undefined);
        this.server = RED.nodes.getNode(config.server);
        this.inputpin = config.inputpin;
        this.getoverwritevalue = config.getoverwritevalue;
        this.topic = config.topic;

        if (this.server) {
            this.server.socket.registerGetpin(this);
			var node = this;
        }

        this.on("input", function (msg) {
            var pinName = this.getoverwritevalue ? msg.payload : this.inputpin, node = this;

            if (this.server && pinName != null) {
				this.server.socket.sendCommand("getpin", function (msg) {
					var data = JSON.parse(msg);

					if (data !== false)
					{
						var pin = data.name, value = data.value, error = data.error;

						if (error === "ERROR_AUTH"){
							node.status(node.getStatusObject("error", "ERROR: NO CONNECTION"));
						}else if (error === "ERROR_UNKNOWN") {
							node.status(node.getStatusObject("error", "UNKNOWN ERROR"));
						}else if (error === "ERROR_PIN") {
							node.status(node.getStatusObject("error", "UNKNOWN PIN: " + pin + "!"));
						} else {
							node.status(node.getStatusObject("info", "Connected - " + pin + " is " + value));

							var setTopic = (node.topic == null || node.topic == "") ? "revpi/single/"+pin : node.topic;
							node.send({payload: value, topic: setTopic});

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
			var node = this;
        }

        this.on("input", function (msg) {
            var val = this.overwritevalue ? this.outputvalue : msg.payload;
            var node = this;


            if (this.server && val !== null && typeof (val) !== "object") {
                this.server.socket.sendCommand("output", function (msgAdditional) {
					var data = JSON.parse(msgAdditional);

					if (data !== false)
					{
						var error_message = data.name;
						if (data.error === "ERROR_AUTH" || data.error === "ERROR_UNKNOWN") {
							node.status(node.getStatusObject("error", "ERROR: NO CONNECTION"));
						}else if (data.error === "ERROR_PIN") {
							node.status(node.getStatusObject("error", "ERROR: " + error_message));
						} else {
							node.status(node.getStatusObject("info", "Change - " + node.outputpin + " is " + val));
						}
					}

                }, [this.outputpin, val]);
            }
        });
    }

    RED.nodes.registerType("revpi-output", RevpiOutput);


    RED.httpAdmin.post("/revpi-server-list-pins/", RED.auth.needsPermission("revpi-server.read"), function (req, res) {
        var result = res;

		if (req.body.host && req.body.port && (req.body.host + "").length > 1) {

			var socketConfig={
				host: req.body.host,
				port: req.body.port,
				user: req.body.user,
				password: req.body.password,
				getAutomaticUpdates : 'False',
				rejectUnauthorized: JSON.parse(req.body.rejectUnauthorized),
				canReconnect: false
			}

			if(req.body.ca){
				socketConfig.ca = req.body.ca;
			}

			var tmp_socket = createWebsocket(socketConfig,function () {

				if(tmp_socket.isAuthorized()){
					tmp_socket.sendCommand("list", function (res) {
						result.json(res);
						removeWebsocket(tmp_socket);
					}, [req.body.force_update]);
				}else{
					result.json(false);
					removeWebsocket(tmp_socket);
				}

			});



        } else {
            result.json(false);
        }
    });
}

