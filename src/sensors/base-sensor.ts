import { ChannelConfiguration, IChannel, ISensor, Profile } from '../types';

const SEND_TIMEOUT = 10000;

export abstract class SensorState {
    public constructor(deviceID: number) {
        this.DeviceID = deviceID;
    }

    DeviceID: number;
    
    // Common page - Manufacturer's Identification
    ManId?: number = undefined;
    SerialNumber?: number = undefined;

    // Common page - Product Information
    HwVersion?: number = undefined;
    SwVersion?: number = undefined;
    ModelNum?: number = undefined;

    // Common page - Battery status
    BatteryLevel?: number = undefined;
    BatteryVoltage?: number = undefined;
    BatteryStatus?: 'New' | 'Good' | 'Ok' | 'Low' | 'Critical' | 'Invalid' = 'Invalid';

    // Debugging
    _RawData: Buffer;

    // Scanner
    Rssi?: number;
    Threshold?: number;
}

export abstract class Sensor implements ISensor {
    protected deviceID: number;
    protected channel?: IChannel;
    protected sendTimeout: number;

    constructor(deviceID:number=0) {
		this.deviceID = Number(deviceID)
        this.sendTimeout = SEND_TIMEOUT
        // Bind 'this' to callbacks, so that it has the proper context
        // when called as a callback in the channel
        this.onMessage = this.onMessage.bind(this); 
        this.onEvent = this.onEvent.bind(this);
	}

    getChannel(): IChannel | undefined {
        return this.channel
    }
    setChannel(channel: IChannel): void {
        this.channel = channel
    }
    getDeviceID(): number {
        return this.deviceID
    }

    setSendTimeout( ms: number) {
        this.sendTimeout = ms;
    }
    getSendTimeout(): number {
        return this.sendTimeout;
    }

    /**
     * As described in some of the profile specification for event-synchronous
     * update devices (example: Biycle Power Device Profile section 10.4.1.2)
     * 
     * "If the crank is not rotating in an event-synchronous system, new power
     * updates cannot occur and the sensor continues to broadcast the last 
     * message. Displays should interpret repeated messages as zero cadence. 
     * The number of seconds of repeated messages that must occur before 
     * interpreting zero cadence is left to the manufacturer to decide."
     * 
     * This implementaion provides a basic hash of a given message (or event)
     * but it can (and should) be overridden by sensors that have event counts
     * and similar data that allows for easier identification of repeated 
     * messages.
     * 
     * @param message The message being hashed
     * @returns The hash of the given message
     */
    // protected hashObject(message: Object): string {
    //     let hash = 0
    //     let str = JSON.stringify(message);
    //     for (let i = 0; i < str.length; i++) {
    //         hash = (hash << 5) - hash + str.charCodeAt(i)
    //         hash &= hash // Convert to 32bit integer
    //     }
    //     return (hash >>> 0).toString(36)
    // }

    abstract getProfile(): Profile;
    abstract getDeviceType(): number
    abstract getChannelConfiguration(): ChannelConfiguration;

    abstract onMessage(data: Buffer): void; 
    abstract onEvent(data: Buffer): void;
}
