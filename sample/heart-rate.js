const {HeartRateSensor} = require('../lib');
const {AntDevice} = require('../lib/bindings')

const ant = new AntDevice({startupTimeout:2000 /*,debug:true, logger:console*/})

const sleep = async (ms) => new Promise( resolve=>  setTimeout(resolve,ms))

let opened = false

async function main( deviceID=-1) {

	do {
		opened = await ant.open()
		if (!opened) {
			console.log('could not open Ant Stick')
			await sleep(5000)
			//return;
		}
		else {
			console.log('device opened')
		}

		
			
	}
	while (!opened)

		const channel = await ant.getChannel();
		if (!channel) {
			console.log('could not open channel')
			return;
		}
	

	if (deviceID===-1) { // scanning for device
		console.log('Scanning for sensor(s)')
		const sensor = new HeartRateSensor()
        channel.on('data', onData)
		channel.startScanner()
		channel.attach(sensor)
	}
	else  {  // device ID known
		console.log(`Connecting with id=${deviceID}`)
		const sensor = new HeartRateSensor(deviceID)
        channel.on('data', onData)
		const started = await channel.startSensor(sensor)
        if (!started) {
            console.log('could not start sensor')
            ant.close();
        }
	} 
	
}

function onData(profile, deviceID,data) {
	console.log(`id: ANT+${profile} ${deviceID}, heart rate: ${data.ComputedHeartRate}`);
}

async function onAppExit() {
	if (opened)
		await ant.close();
	
	process.exit();
}

process.on('SIGINT',  async () => await onAppExit() );  // CTRL+C
process.on('SIGQUIT', async () => await onAppExit() ); // Keyboard quit
process.on('SIGTERM', async() => await onAppExit() ); // `kill` command


const args = process.argv.slice(2);
const deviceID = args.length>0 ? args[0] : undefined;

main( deviceID );
