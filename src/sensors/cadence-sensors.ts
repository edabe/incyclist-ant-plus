/*
 * ANT+ profile: https://www.thisisant.com/developer/ant-plus/device-profiles/#523_tab
 * Spec sheet: https://www.thisisant.com/resources/bicycle-speed-and-cadence/
 */

import { ChannelConfiguration, ISensor, Profile } from '../types';
import { Constants } from '../consts';
import { Messages } from '../messages';
import Sensor from './base-sensor';

export class CadenceSensorState {
    constructor(deviceID: number) {
        this.DeviceID = deviceID;
    }

    DeviceID: number;
    ManId?: number;

    CadenceEventTime: number;
    CumulativeCadenceRevolutionCount: number;
    CalculatedCadence: number;
    Motion?: boolean;
    EventTime: number;

    OperatingTime?: number;
    SerialNumber?: number;
    HwVersion?: number;
    SwVersion?: number;
    ModelNum?: number;
    BatteryVoltage?: number;
    BatteryStatus?: 'New' | 'Good' | 'Ok' | 'Low' | 'Critical' | 'Invalid';
    
    Rssi: number;
    Threshold: number;
}

const DEVICE_TYPE = 0x7a;
const PROFILE = 'CAD';
const PERIOD = 8102;

export default class CadenceSensor extends Sensor implements ISensor {
    private states: { [id: number]: CadenceSensorState } = {};

    getDeviceType(): number {
        return DEVICE_TYPE;
    }
    getProfile(): Profile {
        return PROFILE;
    }
	getDeviceID(): number {
		return this.deviceID
	}
    getChannelConfiguration(): ChannelConfiguration {
        return { 
            type: 'receive', 
            transmissionType: 0,
            timeout: Constants.TIMEOUT_NEVER,
            period: PERIOD,
            frequency: 57
        };
    }
    onEvent(data: Buffer) {
        return;
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
            this.states[deviceID] = new CadenceSensorState(deviceID);
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
                const newHash = this.hashObject(this.states[deviceID])
                if ((this.deviceID === 0 || this.deviceID === deviceID) && oldHash !== newHash) {
                    channel.onDeviceData(this.getProfile(), deviceID, this.states[deviceID]);
                }
                break;
            default:
                break;
        }
    }
}

const TOGGLE_MASK = 0x80;

function updateState(state: CadenceSensorState, data: Buffer) {
    const page = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA);
    switch (page & ~TOGGLE_MASK) { //check the new pages and remove the toggle bit
        case 1: { // cumulative operating time
            // Decode the cumulative operating time
            state.OperatingTime = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
            state.OperatingTime |= data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 2) << 8;
            state.OperatingTime |= data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 3) << 16;
            state.OperatingTime *= 2;
            break;
        }
        case 2: { // manufacturer id
            // Decode the Manufacturer ID
            state.ManId = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
            // Decode the 4 byte serial number
            state.SerialNumber = state.DeviceID;
            state.SerialNumber |= data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 2) << 16;
            state.SerialNumber >>>= 0;
            break;
        }
        case 3: { // product id
            // Decode HW version, SW version, and model number
            state.HwVersion = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1);
            state.SwVersion = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 2);
            state.ModelNum = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 3);
            break;
        }
        case 4: { // battery status
            const batteryFrac = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 2);
            const batteryStatus = data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 3);
            state.BatteryVoltage = (batteryStatus & 0x0f) + batteryFrac / 256;
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
        case 5: { // motion and speed
            // NOTE: This code is untested
            state.Motion = (data.readUInt8(Messages.BUFFER_INDEX_MSG_DATA + 1) & 0x01) === 0x01;
            if (!state.Motion) {
                state.CalculatedCadence = 0;
                break; // combining case 5 and case 1. If motion is 1 (stopped), break.
            }
        }
        case 0: { // default or unknown page
            // Det old state for calculating cumulative values
            //
            // Older devices based on accelerometers that transmit page 0 instead of page 5
            // will not set the cadence to zero when the pedal stops moving. Also, these
            // devices struggle to calculate the cadence when it is below 30rpm (based on
            // old Wahoo cadence sensor).
            // To account for that, store the cadence event time only when data changes,
            // and zero the cadence if the event time repeats for longer than 5 seconds
            const oldEventTime = state.EventTime;
            const oldCadenceTime = state.CadenceEventTime;
            const oldCadenceCount = state.CumulativeCadenceRevolutionCount;

            const eventTime = Date.now();
            let cadenceTime = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 4);
            const cadenceCount = data.readUInt16LE(Messages.BUFFER_INDEX_MSG_DATA + 6);

            if (cadenceTime !== oldCadenceTime) {
                // Calculate cadence
                state.EventTime = eventTime;
                state.CadenceEventTime = cadenceTime;
                state.CumulativeCadenceRevolutionCount = cadenceCount;
                if (oldCadenceTime > cadenceTime) {
                    // Hit rollover value
                    cadenceTime += 1024 * 64;
                }
                const cadence = (60 * (cadenceCount - oldCadenceCount) * 1024) / (cadenceTime - oldCadenceTime);
                if (!isNaN(cadence)) {
                    state.CalculatedCadence = cadence;
                }
            }
            else if ((eventTime - oldEventTime) >= 5000) {
                // Force cadence to zero
                state.CalculatedCadence = 0;
            }
            break;
        }
        default:
            break;
    }
}
