var mqtt = require('mqtt');
const options = {
    clientId: "RO-bot",
    username: "p0int0megA",
    password: "hm49DG275$wPkd7B",
    clean: true,
    rejectUnauthorized: false
};
const event_topic = 'pointomega/redone/srv';
const mod_all_topic = 'pointomega/redone/mod/all';

const url = "mqtts://raw.pointomega.de:48883"
var client = mqtt.connect(url, options)

client.on("error", function(error) {
    console.log("Can't connect" + error);
    process.exit(1)
});
client.subscribe(mod_all_topic, { qos: 1 });
client.subscribe(event_topic, { qos: 1 });

client.on('message', function(topic, message, packet) {
    console.log(`${topic}: ${message}`);
});

client.on("connect", function() {
    console.log("connected  " + client.connected);
})

var message_options = {
    retain: true,
    qos: 1
};
const registration_message = {
    "e_type": "IND",
    "e_name": "Register",
    "e_from": "pointomega/redone/mod/RO-Bot",
    "e_id": 1,
    "m_name": "RO-Bot",
    "m_role": "1"
}
client.publish(event_topic, JSON.stringify(registration_message), message_options)
client.subscribe('pointomega/redone/mod/RO-Bot', { qos: 1 });