/*
 * ANT+ profile: https://www.thisisant.com/developer/ant-plus/device-profiles/#521_tab
 * Spec sheet: https://www.thisisant.com/resources/bicycle-power/
 */

import { ChannelConfiguration, ISensor, Profile } from '../types';
import { Constants } from '../consts';
import { Messages } from '../messages';
import Sensor from './base-sensor';

export class BicyclePowerSensorState {
	constructor(deviceID: number) {
		this.DeviceID = deviceID;
	}

	DeviceID: number;

	// Comon PWR
	Cadence?: number = undefined;
	CalculatedCadence?: number = undefined;
	Power?: number = undefined;
	CalculatedPower?: number = undefined;
	CalculatedTorque?: number = undefined;

	// 0x01 page
	Offset: number = 0;

	// 0x10 page
	_0x10_EventCount?: number = 0;
	_0x10_EventTime?: number = Date.now();
	PedalPower?: number = undefined;
	RightPedalPower?: number = undefined;
	LeftPedalPower?: number = undefined;
	AccumulatedPower?: number = 0;

	// 0x12 page
	_0x12_EventCount?: number = 0;
	_0x12_EventTime?: number = Date.now();
	CrankTicks?: number = 0;
	AccumulatedCrankPeriod?: number = 0;
	AccumulatedTorque?: number = 0;

	// 0x20 page
	_0x20_EventCount?: number = 0;
	Slope?: number = 0;
	CrankTicksStamp?: number = 0;
	TorqueTicksStamp?: number = 0;

	// 0x50 page
    ManId?: number = undefined;
	SerialNumber?: number = undefined;

	// 0x51 page
	HwVersion?: number = undefined;
	SwVersion?: number = undefined;
	ModelNum?: number = undefined;

	// 0x52 page
	BatteryLevel?: number = undefined;
	BatteryVoltage?: number = undefined;
	BatteryStatus?: 'New' | 'Good' | 'Ok' | 'Low' | 'Critical' | 'Invalid' = 'Invalid';

	// Scanner
	Rssi?: number;
	Threshold?: number;
}

const DEVICE_TYPE 	= 0x0B
const PROFILE 		= 'PWR';
const PERIOD		= 8182

export default class BicyclePowerSensor extends Sensor implements ISensor {
	private states: { [id: number]: BicyclePowerSensorState } = {};

	getDeviceType(): number {
		return DEVICE_TYPE
	}
	getProfile(): Profile {
		return PROFILE
	}
	getDeviceID(): number {
		return this.deviceID
	}
	getChannelConfiguration(): ChannelConfiguration {
		return { 
			type:'receive', 
			transmissionType:0,
			timeout:Constants.TIMEOUT_NEVER,
			period:PERIOD,
			frequency:57
		}
	}
	onEvent(data: Buffer) {
		return
	}
	onMessage(data:Buffer) {
		const channel = this.getChannel()
		if (!channel) return;

		const channelNo = channel.getChannelNo()
		const deviceID = data.readUInt16LE(Messages.BUFFER_INDEX_EXT_MSG_BEGIN + 1);
		const deviceType = data.readUInt8(Messages.BUFFER_INDEX_EXT_MSG_BEGIN + 3);

		if (data.readUInt8(Messages.BUFFER_INDEX_CHANNEL_NUM) !== channelNo || deviceType !== this.getDeviceType()) {
			return;
		}

		if (!this.states[deviceID]) {
			this.states[deviceID] = new BicyclePowerSensorState(deviceID);
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
				const oldHash = this.hashObject(this.states[deviceID]);
				updateState(this.states[deviceID], data);
                const newHash = this.hashObject(this.states[deviceID]);
                if ((this.deviceID === 0 || this.deviceID === deviceID) && oldHash !== newHash) {
                    channel.onDeviceData(this.getProfile(), deviceID, this.states[deviceID]);
                }
				break;
			default:
				break;
		}
	}
}

function updateState(state: BicyclePowerSensorState, data: Buffer) {
	const page = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA);
	switch (page) {
		case 0x01: { // calibration parameters
			const calID = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
			if (calID === 0x10) {
				const calParam = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 2);
				if (calParam === 0x01) {
					state.Offset = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 6);
				}
			}
			break;
		}
		case 0x10: { // power only
			// Stages power meter will keep sending the last non-zero value when there is 
			// no power being applied to the cranks.
			// To account for that, store the cadence event time only when data changes,
			// and zero the cadence if the event time repeats for longer than 5 seconds
			const oldEventTime = state._0x10_EventTime;
			const oldEventCount = state._0x10_EventCount;

            const eventTime = Date.now();
			const eventCount = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
			let cadence = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 3);
			if (cadence === 0xFF) {
				cadence = undefined;
			}
			let delay = 125000 / cadence ? cadence : 62.5; // progressive delay, more sensitive at higher cadences
			if (oldEventCount !== eventCount) {
				// Calculate power
				state._0x10_EventTime = eventTime;
				state._0x10_EventCount = eventCount;
				const pedalPower = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 2);
				if (pedalPower !== 0xFF) {
					if (pedalPower & 0x80) {
						state.PedalPower = pedalPower & 0x7F;
						state.RightPedalPower = state.PedalPower;
						state.LeftPedalPower = 100 - state.RightPedalPower;
					} else {
						state.PedalPower = pedalPower & 0x7F;
						state.RightPedalPower = undefined;
						state.LeftPedalPower = undefined;
					}
				}
				state.Cadence = cadence;
				state.AccumulatedPower = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 4);
				state.Power = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 6);
			}
			else if ((eventTime - oldEventTime) >= delay) {
				// Force power and candence to zero
				state.Cadence = 0;
				state.Power = 0;
			}
			break;
		}
		case 0x12: { // standard crankk torque
			// Stages power meter is event_synchronous and will only send new event data
			// when a complete crank rotation happens. If the crank stops rotating, the
			// same event is repeated, making it difficult to interpret a zero-cadence.
			// To account for that, store the cadence event time only when data changes,
			// and zero the cadence if the event time repeats for longer than 5 seconds
			const oldEventTime = state._0x12_EventTime;
			const oldEventCount = state._0x12_EventCount;
			const oldCrankTicks = state.CrankTicks;
			const oldAccumulatedPeriod = state.AccumulatedCrankPeriod;
			const oldAccumulatedTorque = state.AccumulatedTorque;

            const eventTime = Date.now();
			let eventCount = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
			let cadence = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 3);
			if (cadence === 0xFF) {
				cadence = undefined;
			}
			let delay = 125000 / cadence ? cadence : 62.5; // progressive delay, more sensitive at higher cadences
			if (oldEventCount !== eventCount) {
				state._0x12_EventTime = eventTime;
				state._0x12_EventCount = eventCount;
				if (oldEventCount > eventCount) {
					// Detected rollover
					eventCount += 256;
				}
				let crankTicks = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 2);
				state.CrankTicks = crankTicks;
				if (oldCrankTicks > crankTicks) {
					// Detected rollover
					crankTicks += 256;
				}
				state.Cadence = cadence;
				let accumulatedPeriod = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 4);
				state.AccumulatedCrankPeriod = accumulatedPeriod
				if (oldAccumulatedPeriod > accumulatedPeriod) {
					// Detected rollover
					accumulatedPeriod += 65536;
				}
				let accumulatedTorque = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 6);
				state.AccumulatedTorque = accumulatedTorque
				if (oldAccumulatedTorque > accumulatedTorque) {
					// Detected rollover
					accumulatedTorque += 65536;
				}

				// Calculating cadence and power
				const rotationEvents = eventCount - oldEventCount;
				const rotationPeriod = (accumulatedPeriod - oldAccumulatedPeriod) / 2048;
				const angularVel = 2 * Math.PI * rotationEvents / rotationPeriod;
				const torque = (accumulatedTorque - oldAccumulatedTorque) / (32 * rotationEvents);

				state.CalculatedTorque = torque;
				state.CalculatedPower = angularVel * torque;
				state.CalculatedCadence = 60 * rotationEvents / rotationPeriod;
			}
			else if ((eventTime - oldEventTime) >= delay) {
				// Force power and candence to zero
				state.Cadence = 0;
				state.CalculatedTorque = 0;
				state.CalculatedPower = 0;
				state.CalculatedCadence = 0;
			}
			break;
		}
		case 0x20: { // crank torque frequency
			const oldEventCount = state._0x20_EventCount;
			const oldTimeStamp = state.CrankTicksStamp;
			const oldTorqueTicksStamp = state.TorqueTicksStamp;

			let eventCount = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
			const slope = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 3);
			let timeStamp = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 5);
			let torqueTicksStamp = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 7);

			if (timeStamp !== oldTimeStamp && eventCount !== oldEventCount) {
				state._0x20_EventCount = eventCount;
				if (oldEventCount > eventCount) { //Hit rollover value
					eventCount += 255;
				}

				state.CrankTicksStamp = timeStamp;
				if (oldTimeStamp > timeStamp) { //Hit rollover value
					timeStamp += 65400;
				}

				state.Slope = slope;
				state.TorqueTicksStamp = torqueTicksStamp;
				if (oldTorqueTicksStamp > torqueTicksStamp) { //Hit rollover value
					torqueTicksStamp += 65535;
				}

				const elapsedTime = (timeStamp - oldTimeStamp) * 0.0005;
				const torqueTicks = torqueTicksStamp - oldTorqueTicksStamp;

				const cadencePeriod = elapsedTime / (eventCount - oldEventCount); // s
				const cadence = Math.round(60 / cadencePeriod); // rpm
				state.CalculatedCadence = cadence;

				const torqueFrequency = (1 / (elapsedTime / torqueTicks)) - state.Offset; // Hz
				const torque = torqueFrequency / (slope / 10); // Nm
				state.CalculatedTorque = torque;

				state.CalculatedPower = torque * cadence * Math.PI / 30; // Watts
			}
			break;
		}
        case 0x50: { // manufacturer's information
			// decode the Manufacturer ID
            state.ManId = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 4);
			// decode the 4 byte serial number
			state.SerialNumber = state.DeviceID;
			state.SerialNumber |= data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 2) << 16;
			state.SerialNumber >>>= 0;
            break;
		}
        case 0x51: { // product information
			// decode HW version, SW version, and model number
			state.HwVersion = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
			state.SwVersion = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 2);
			state.ModelNum = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 3);
			break;
        }
        case 0x52: { // battery status
			const batteryLevel = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
			const batteryFrac = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 2);
			const batteryStatus = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 3);
			if (batteryLevel !== 0xFF) {
				state.BatteryLevel = batteryLevel;
			}
			state.BatteryVoltage = (batteryStatus & 0x0F) + (batteryFrac / 256);
			const batteryFlags = (batteryStatus & 0x70) >>> 4;
			switch (batteryFlags) {
				case 1:
					state.BatteryStatus = 'New';
					break;
				case 2:
					state.BatteryStatus = 'Good';
					break;
				case 3:
					state.BatteryStatus = 'Ok';
					break;
				case 4:
					state.BatteryStatus = 'Low';
					break;
				case 5:
					state.BatteryStatus = 'Critical';
					break;
				default:
					state.BatteryVoltage = undefined;
					state.BatteryStatus = 'Invalid';
					break;
			}
			break;            
		}
		default:
			return;
	}	
}
