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
    ManId?: number;

	PedalPower?: number;
	RightPedalPower?: number;
	LeftPedalPower?: number;
	Cadence?: number;
	AccumulatedPower?: number;
	Power?: number;
	offset: number = 0;
	EventCount?: number;
	TimeStamp?: number;
	Slope?: number;
	TorqueTicksStamp?: number;
	CalculatedCadence?: number;
	CalculatedTorque?: number;
	CalculatedPower?: number;

	SerialNumber?: number;
	HwVersion?: number;
	SwVersion?: number;
	ModelNum?: number;
	BatteryLevel?: number;
	BatteryVoltage?: number;
	BatteryStatus?: 'New' | 'Good' | 'Ok' | 'Low' | 'Critical' | 'Invalid';

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
					state.offset = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 6);
				}
			}
			break;
		}
		case 0x10: { // power only
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
			} else {
				state.PedalPower = undefined;
				state.RightPedalPower = undefined;
				state.LeftPedalPower = undefined;
			}
			// When rider stops pedaling, Stages power meter will keep sending the last non-zero
			// data for power and cadence, even though the cranks are no longer spinning.
			// Rely on AccumulatedPower to detect and zero these values: 
			// If AccumulatedPower(N) == AccumulatedPower(N-1), then the rider is not pedaling
			const cadence = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 3);
			const accumulatedPower = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 4);
			const staleData = accumulatedPower == state.AccumulatedPower;
			if (cadence !== 0xFF) {
				state.Cadence = staleData ? 0 : cadence;
			} else {
				state.Cadence = undefined;
			}
			state.Power = staleData ? 0 : data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 6);
			state.AccumulatedPower = accumulatedPower;
			break;
		}
		case 0x20: { // crank torque frequency
			const oldEventCount = state.EventCount;
			const oldTimeStamp = state.TimeStamp;
			const oldTorqueTicksStamp = state.TorqueTicksStamp;

			let eventCount = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
			const slope = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 3);
			let timeStamp = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 5);
			let torqueTicksStamp = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 7);

			if (timeStamp !== oldTimeStamp && eventCount !== oldEventCount) {
				state.EventCount = eventCount;
				if (oldEventCount > eventCount) { //Hit rollover value
					eventCount += 255;
				}

				state.TimeStamp = timeStamp;
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

				const torqueFrequency = (1 / (elapsedTime / torqueTicks)) - state.offset; // Hz
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
