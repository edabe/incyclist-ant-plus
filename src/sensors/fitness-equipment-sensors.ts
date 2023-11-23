/*
 * ANT+ profile: https://www.thisisant.com/developer/ant-plus/device-profiles/#521_tab
 * Spec sheet: https://www.thisisant.com/resources/bicycle-power/
 */

import { ChannelConfiguration, ISensor, Profile } from '../types';
import { Constants } from '../consts';
import { Messages } from '../messages';
import { Sensor, SensorState } from './base-sensor';

export class FitnessEquipmentSensorState extends SensorState {

	// Data Page 1 (0x01) - Calibration Request and Response Page
	Temperature?: number;
	ZeroOffset?: number;
	SpinDownTime?: number;

	// Data Page 2 (0x02) - Calibration in Progress
	// Not supported

	// Data Page 16 (0x10) - General FE Data
	EquipmentType?: 'Treadmill' | 'Elliptical' | 'StationaryBike' | 'Rower' | 'Climber' | 'NordicSkier' | 'Trainer' | 'General';
	ElapsedTime?: number;
	Distance?: number;
	RealSpeed?: number;
	VirtualSpeed?: number;
	HeartRate?: number;
	HeartRateSource?: 'HandContact' | 'EM' | 'ANT+';
	State?: 'OFF' | 'READY' | 'IN_USE' | 'FINISHED';

	// Date Page 17 (0x11) - General Settings Page
	CycleLength?: number;
	Incline?: number;
	Resistance?: number;

	// Data Page 18 (0x12) - General FE Metabolic Data
	METs?: number;
	CaloricBurnRate?: number;
	Calories?: number;

	// Data Page 19 (0x13) - Specific Treadmil Data
	// Not supported

	// Data Page 20 (0x14) - Specific Elliptical Data
	// Not supported

	// Data Page 22 (0x16) - Specific Rower Data
	// Not supported

	// Data Page 23 (0x17) - Specific Climber Data
	// Not supported

	// Data Page 24 (0x18) - Specific Nordic Skier Data
	// Not supported

	// Data Page 25 (0x19) - Specific Trainer/Stationary Bike Data
	_0x19_EventCount?: number;
	_0x19_Cadence?: number;
	_0x19_AccumulatedPower?: number;
	_0x19_InstantaneousPower?: number;
	_0x19_AveragePower?: number;
	_0x19_TrainerStatus?: number;
	_0x19_TargetStatus?: 'OnTarget' | 'LowSpeed' | 'HighSpeed';

	// Data Page 26 (0x1A) - Specific Trainer Torque Data
	// Not supported

	// Data Page 48 (0x30) - Basic Resistance
	// Not supported

	// Data Page 49 (0x31) - Target Power
	// Not supported

	// Data Page 50 (0x32) - Wind Resistance
	// Not supported

	// Data Page 51 (0x33) - Track Resistance
	// Not supported

	// Data Page 54 (0x36) - FE Capabilities
	// Not supported

	// Data Page 55 (0x37) - User Configuration
	// Not supported

	// Data Page 71 (0x47) - Command Status
	// Not supported (mandatory)

	// Data Page 86 (0x56) - ???
	PairedDevices: any[] = [];
}

const DEVICE_TYPE = 0x11;
const PROFILE = 'FE';
const PERIOD = 8192;

export default class FitnessEquipmentSensor extends Sensor implements ISensor {
	private states: { [id: number]: FitnessEquipmentSensorState } = {};
	private isRestarting: boolean;

	getDeviceType(): number {
		return DEVICE_TYPE;
	}
	getProfile(): Profile {
		return PROFILE;
	}
	getDeviceID(): number {
		return this.deviceID;
	}
	getChannelConfiguration(): ChannelConfiguration {
		return { 
			type:'receive',
			transmissionType:0,
			timeout:Constants.TIMEOUT_NEVER,
			period:PERIOD,
			frequency:57
		};
	}
	onMessage(data: Buffer) {
		const channel = this.getChannel();
		if (!channel) return;

		const channelNo = channel.getChannelNo();
		const deviceID = data.readUInt16LE(Messages.BUFFER_INDEX_EXT_MSG_BEGIN + 1);
		const deviceType = data.readUInt8(Messages.BUFFER_INDEX_EXT_MSG_BEGIN + 3);

		if (data.readUInt8(Messages.BUFFER_INDEX_CHANNEL_NUM) !== channelNo || deviceType !== this.getDeviceType()) {
			return;
		}

		if (!this.states[deviceID]) {
			this.states[deviceID] = new FitnessEquipmentSensorState(deviceID);
		}

		if (data.readUInt8(Messages.BUFFER_INDEX_EXT_MSG_BEGIN) & 0x40) {
			if (data.readUInt8(Messages.BUFFER_INDEX_EXT_MSG_BEGIN + 5) === 0x20) {
				this.states[deviceID].Rssi = data.readInt8(Messages.BUFFER_INDEX_EXT_MSG_BEGIN + 6);
				this.states[deviceID].Threshold = data.readInt8(Messages.BUFFER_INDEX_EXT_MSG_BEGIN + 7);
			}
		}

		switch (data.readUInt8(Messages.BUFFER_INDEX_MSG_TYPE)) {
			case Constants.MESSAGE_CHANNEL_BROADCAST_DATA:
			case Constants.MESSAGE_CHANNEL_ACKNOWLEDGED_DATA:
			case Constants.MESSAGE_CHANNEL_BURST_DATA:
                updateState(this.states[deviceID], data);
                if (this.deviceID === 0 || this.deviceID === deviceID) {
                    channel.onDeviceData(this.getProfile(), deviceID, this.states[deviceID]);
                }
				break;
			default:
				break;
		}
	}

	private logEvent(event: Object) {
		const channel = this.getChannel();
		if (channel && channel.getProps().logger && channel.getProps().logger.logEvent !== undefined) {
			try {
				channel.getProps().logger.logEvent(event);
			} catch {
				console.error(`ERROR: Unable to log event ${JSON.stringify(event)}`);
			}
		} 
	}

	protected async waitForRestart(): Promise<void> {
		return new Promise(done => {
			if (!this.isRestarting)	
				return done();
			const iv = setInterval(() => {
				if (!this.isRestarting) {
					clearInterval(iv);
					done();
				}
			}, 100);
		});
	}

	async onEvent(data: Buffer) {
		const msg = data.readUInt8(4);
		const code = data.readUInt8(5);
		const event = {
			msg: msg.toString(16),
			code: code.toString(16),
		};
		if (event.msg==='1' && code in [0,3,4,5,6])
			return;

		this.logEvent({
			message:'channel event', 
			channelNo:this.channel.getChannelNo() , 
			deviceID:this.getDeviceID(), 
			event
		});
		
		return;
	}

	// Commands
	async send(data: Buffer, props:{logStr?:string, timeout?:number,args?:object}):Promise<boolean> {
		const { logStr, timeout, args } = props || {};
		const channel = this.getChannel();
		if (!channel)
			return false;

		if (this.isRestarting) 
			await this.waitForRestart();

		const tsStart = Date.now();
		this.logEvent({
			message:'sending FE message', 
			command:logStr,
			args,
			timeout
		});

		const res = await channel.sendMessage(data,{timeout});
		if (this.isRestarting) 
			await this.waitForRestart();

		const duration = Date.now() - tsStart;
		this.logEvent({
			message:'FE message response', 
			command:logStr, 
			args,
			response:res, 
			duration
		});

		// workaround for old Incyclist versions - can be removed later
		if (duration > timeout) {
			throw new Error('Timeout');
		}
		// ... end workaround
		return res;		
	}

    async sendUserConfiguration(userWeight: number, bikeWeight: number, wheelDiameter: number, gearRatio: number): Promise<boolean> {
		var payload = [];
		payload.push ( this.channel.getChannelNo());

		const logStr = 'setUserConfiguration'
		const args = {userWeight, bikeWeight, wheelDiameter, gearRatio}

		var m = userWeight===undefined ? 0xFFFF : userWeight;
		var mb = bikeWeight===undefined ? 0xFFF: bikeWeight;
		var d = wheelDiameter===undefined ? 0xFF : wheelDiameter;
		var gr = gearRatio===undefined ? 0x00 : gearRatio;
		var dOffset = 0xFF;

		if (m!==0xFFFF)
			m = Math.trunc(m*100);
		if (mb!==0xFFF)
			mb = Math.trunc(mb*20);        
		if (d!==0xFF) {
			d = d*1000;
			dOffset = d%10;
			d = Math.trunc(d/10);
		}
		if (gr!==0x00) {
			gr= Math.trunc(gr/0.03);
		}

		payload.push (0x37);                        // Data page 55: User Configuration
		payload.push (m&0xFF);                      // Weight LSB
		payload.push ((m>>8)&0xFF);                 // Weight MSB
		payload.push (0xFF);                        // Reserved
		payload.push (((mb&0xF)<<4)|(dOffset&0xF)); // Bicycle weight LSN  and 
		payload.push ((mb>>4)&0xF);                 // Bicycle weight MSB 
		payload.push (d&0xFF);                      // Bicycle wheel diameter 
		payload.push (gr&0xFF);                     // Gear ratio 

		let msg = Messages.acknowledgedData(payload);
		return await this.send(msg,{logStr,timeout:this.sendTimeout,args});
    }

    async sendBasicResistance(resistance: number): Promise<boolean> {
		var payload = [];
		payload.push (this.channel.getChannelNo());

		const logStr = 'setBasicResistance';
		const args = {resistance};

		var res = resistance === undefined ?  0 : resistance;	
		res = res / 0.5;

		payload.push (0x30);                        // Data page 48: Basic Resistance
		payload.push (0xFF);                        // Reserved
		payload.push (0xFF);                        // Reserved
		payload.push (0xFF);                        // Reserved
		payload.push (0xFF);                        // Reserved
		payload.push (0xFF);                        // Reserved
		payload.push (0xFF);                        // Reserved
		payload.push (res&0xFF);                    // Resistance 

		let msg = Messages.acknowledgedData(payload);
		return await this.send(msg,{logStr,timeout:this.sendTimeout,args});
    }
    
    async sendTargetPower(power: number): Promise<boolean> {
		var payload = [];
		payload.push (this.channel.getChannelNo());

		const logStr = 'setTargetPower';
		const args = {power};

		var p = power === undefined ?  0x00 : power;

		p = p * 4;
		payload.push (0x31);                        // Data page 49: Target Power
		payload.push (0xFF);                        // Reserved
		payload.push (0xFF);                        // Reserved
		payload.push (0xFF);                        // Reserved
		payload.push (0xFF);                        // Reserved
		payload.push (0xFF);                        // Reserved
		payload.push (p&0xFF);                      // Power LSB
		payload.push ((p>>8)&0xFF);                 // Power MSB 

		let msg = Messages.acknowledgedData(payload);
		return await this.send(msg,{logStr,args,timeout:this.sendTimeout});
    }

    async sendWindResistance(windCoeff: number,windSpeed: number, draftFactor: number): Promise<boolean> {
		var payload = [];
		payload.push (this.channel.getChannelNo());

		const logStr = 'setWindResistance';
		const args = {windCoeff,windSpeed,draftFactor};

		var wc = windCoeff===undefined ? 0xFF : windCoeff;
		var ws = windSpeed===undefined ? 0xFF : windSpeed;
		var df = draftFactor===undefined ? 0xFF : draftFactor;

		if (wc!==0xFF) {
			wc = Math.trunc(wc/0.01);
		}
		if (ws!==0xFF) {
			ws = Math.trunc(ws+127);
		}
		if (df!==0xFF) {
			df = Math.trunc(df/0.01);
		}

		payload.push (0x32);                        // data page 50: Wind Resistance
		payload.push (0xFF);                        // reserved
		payload.push (0xFF);                        // reserved
		payload.push (0xFF);                        // reserved
		payload.push (0xFF);                        // reserved
		payload.push (wc&0xFF);                     // Wind Resistance Coefficient
		payload.push (ws&0xFF);                     // Wind Speed
		payload.push (df&0xFF);                     // Drafting Factor

		let msg = Messages.acknowledgedData(payload);
		return await this.send(msg,{logStr,args,timeout:this.sendTimeout});
    }

    async sendTrackResistance(slope: number, rrCoeff?: number): Promise<boolean> {

		var payload = [];
		payload.push (this.channel.getChannelNo());
		
		const logStr = 'setTrackResistance';
		const args = {slope, rrCoeff};

		var s = slope === undefined ?  0xFFFF : slope;
		var rr = rrCoeff === undefined ? 0xFF : rrCoeff;

		if (s!==0xFFFF) {
			s = Math.trunc((s+200)/0.01);
		}
		if (rr!==0xFF) {
			rr = Math.trunc(rr/0.00005);
		}

		payload.push (0x33);                        // Data page 51: Track Resistance 
		payload.push (0xFF);                        // Reserved
		payload.push (0xFF);                        // Reserved
		payload.push (0xFF);                        // Reserved
		payload.push (0xFF);                        // Reserved
		payload.push (s&0xFF);                      // Grade (Slope) LSB
		payload.push ((s>>8)&0xFF);                 // Grade (Slope) MSB
		payload.push (rr&0xFF);                     // Drafting Factor

		let msg = Messages.acknowledgedData(payload);
		return await this.send(msg,{logStr,args,timeout:this.sendTimeout});
    }
}

function resetState(state: FitnessEquipmentSensorState) {
	delete state.ElapsedTime;
	delete state.Distance;
	delete state.RealSpeed;
	delete state.VirtualSpeed;
	delete state.HeartRate;
	delete state.HeartRateSource;
	delete state.CycleLength;
	delete state.Incline;
	delete state.Resistance;
	delete state.METs;
	delete state.CaloricBurnRate;
	delete state.Calories;
	delete state._0x19_EventCount;
	delete state._0x19_Cadence;
	delete state._0x19_AccumulatedPower;
	delete state._0x19_InstantaneousPower;
	delete state._0x19_AveragePower;
	delete state._0x19_TrainerStatus;
	delete state._0x19_TargetStatus;
}

function updateState(state: FitnessEquipmentSensorState, data: Buffer) {
	state._RawData = data;

	const page = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA);
	switch (page) {
		case 0x01: {
			const temperature = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 3);
			if (temperature !== 0xFF) {
				state.Temperature = -25 + temperature * 0.5;
			}
			const calBF = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
			if (calBF & 0x40) {
				state.ZeroOffset = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 4);
			}
			if (calBF & 0x80) {
				state.SpinDownTime = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 6);
			}
			break;
		}
		case 0x10: {
			const equipmentTypeBF = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
			switch (equipmentTypeBF & 0x1F) {
				case 19: state.EquipmentType = 'Treadmill'; break;
				case 20: state.EquipmentType = 'Elliptical'; break;
				case 21: state.EquipmentType = 'StationaryBike'; break;
				case 22: state.EquipmentType = 'Rower'; break;
				case 23: state.EquipmentType = 'Climber'; break;
				case 24: state.EquipmentType = 'NordicSkier'; break;
				case 25: state.EquipmentType = 'Trainer'; break;
				default: state.EquipmentType = 'General'; break;
			}
			let elapsedTime = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 2);
			let distance = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 3);
			const speed = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 4);
			const heartRate = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 6);
			const capStateBF = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 7);
			if (heartRate !== 0xFF) {
				switch (capStateBF & 0x03) {
					case 3: {
						state.HeartRate = heartRate;
						state.HeartRateSource = 'HandContact';
						break;
					}
					case 2: {
						state.HeartRate = heartRate;
						state.HeartRateSource = 'EM';
						break;
					}
					case 1: {
						state.HeartRate = heartRate;
						state.HeartRateSource = 'ANT+';
						break;
					}
					default: {
						delete state.HeartRate;
						delete state.HeartRateSource;
						break;
					}
				}
			}

			elapsedTime /= 4;
			const oldElapsedTime = (state.ElapsedTime || 0) % 64;
			if (elapsedTime !== oldElapsedTime) {
				if (oldElapsedTime > elapsedTime) { // Hit rollover value
					elapsedTime += 64;
				}
			}
			state.ElapsedTime = (state.ElapsedTime || 0) + elapsedTime - oldElapsedTime;

			if (capStateBF & 0x04) {
				const oldDistance = (state.Distance || 0) % 256;
				if (distance !== oldDistance) {
					if (oldDistance > distance) { // Hit rollover value
						distance += 256;
					}
				}
				state.Distance = (state.Distance || 0) + distance - oldDistance;
			} else {
				delete state.Distance;
			}
			if (capStateBF & 0x08) {
				state.VirtualSpeed = speed / 1000;
				delete state.RealSpeed;
			} else {
				delete state.VirtualSpeed;
				state.RealSpeed = speed / 1000;
			}
			switch ((capStateBF & 0x70) >> 4) {
				case 1: state.State = 'OFF'; break;
				case 2: state.State = 'READY'; resetState(state); break;
				case 3: state.State = 'IN_USE'; break;
				case 4: state.State = 'FINISHED'; break;
				default: delete state.State; break;
			}
			if (capStateBF & 0x80) {
				// lap
			}
			break;
		}
		case 0x11: {
			const cycleLen = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 3);
			const incline = data.readInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 4);
			const resistance = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 6);
			const capStateBF = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 7);
			if (cycleLen !== 0xFF) {
				state.CycleLength = cycleLen / 100;
			}
			if (incline >= -10000 && incline <= 10000) {
				state.Incline = incline / 100;
			}
			if (resistance !== 0xFF) {
				state.Resistance = resistance;
			}
			switch ((capStateBF & 0x70) >> 4) {
				case 1: state.State = 'OFF'; break;
				case 2: state.State = 'READY'; resetState(state); break;
				case 3: state.State = 'IN_USE'; break;
				case 4: state.State = 'FINISHED'; break;
				default: delete state.State; break;
			}
			if (capStateBF & 0x80) {
				// lap
			}
			break;
		}
		case 0x12: {
			const mets = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 2);
			const caloricbr = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 4);
			const calories = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 6);
			const capStateBF = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 7);
			if (mets !== 0xFFFF) {
				state.METs = mets / 100;
			}
			if (caloricbr !== 0xFFFF) {
				state.CaloricBurnRate = caloricbr / 10;
			}
			if (capStateBF & 0x01) {
				state.Calories = calories;
			}
			switch ((capStateBF & 0x70) >> 4) {
				case 1: state.State = 'OFF'; break;
				case 2: state.State = 'READY'; resetState(state); break;
				case 3: state.State = 'IN_USE'; break;
				case 4: state.State = 'FINISHED'; break;
				default: delete state.State; break;
			}
			if (capStateBF & 0x80) {
				// lap
			}
			break;
		}
		case 0x19: {
			const oldEventCount = state._0x19_EventCount || 0;

			let eventCount = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
			const cadence = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 2);
			let accPower = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 3);
			const power = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 5) & 0xFFF;
			const trainerStatus = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 6) >> 4;
			const flagStateBF = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 7);

			if (eventCount !== oldEventCount) {
				state._0x19_EventCount = eventCount;
				if (oldEventCount > eventCount) { //Hit rollover value
					eventCount += 255;
				}
			}

			if (cadence !== 0xFF) {
				state._0x19_Cadence = cadence;
			}

			if (power !== 0xFFF) {
				state._0x19_InstantaneousPower = power;

				const oldAccPower = (state._0x19_AccumulatedPower || 0) % 65536;
				if (accPower !== oldAccPower) {
					if (oldAccPower > accPower) {
						accPower += 65536;
					}
				}
				state._0x19_AccumulatedPower = (state._0x19_AccumulatedPower || 0) + accPower - oldAccPower;

				state._0x19_AveragePower = (accPower - oldAccPower) / (eventCount - oldEventCount);
			}

			state._0x19_TrainerStatus = trainerStatus;

			switch (flagStateBF & 0x03) {
				case 0: state._0x19_TargetStatus = 'OnTarget'; break;
				case 1: state._0x19_TargetStatus = 'LowSpeed'; break;
				case 2: state._0x19_TargetStatus = 'HighSpeed'; break;
				default: delete state._0x19_TargetStatus; break;
			}

			switch ((flagStateBF & 0x70) >> 4) {
				case 1: state.State = 'OFF'; break;
				case 2: state.State = 'READY'; resetState(state); break;
				case 3: state.State = 'IN_USE'; break;
				case 4: state.State = 'FINISHED'; break;
				default: delete state.State; break;
			}
			if (flagStateBF & 0x80) {
				// lap
			}
			break;
		}
		case 0x50: {
			state.HwVersion = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 3);
			state.ManId = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 4);
			state.ModelNum = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 6);
			break;
		}
		case 0x51: {
			const swRevSup = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 2);
			const swRevMain = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 3);
			const serial = data.readInt32LE(Messages.BUFFER_INDEX_MSG_DATA + 4);

			state.SwVersion = swRevMain;

			if (swRevSup !== 0xFF) {
				state.SwVersion += swRevSup / 1000;
			}

			if (serial !== 0xFFFFFFFF) {
				state.SerialNumber = serial;
			}
			break;
		}
		case 0x56: {
			const idx = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
			const tot = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 2);
			const chState = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 3);
			const devId = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 4);
			const trType = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 6);
			const devType = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 7);

			if (idx === 0) {
				state.PairedDevices = [];
			}

			if (tot > 0) {
				state.PairedDevices.push({ id: devId, type: devType, paired: (chState & 0x80) ? true : false });
			}
			break;
		}
		default:
			return;
	}
}
