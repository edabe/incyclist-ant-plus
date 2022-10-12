import { Constants } from "./consts";
import EventEmitter from "events";
import { Messages } from "./messages";
import { ChannelProps, IAntDevice, IChannel, ISensor } from "./types";

export type MessageInfo = {
	msgId: number;
	data?: Buffer;
	resolve
}

export const START_TIMEOUT = 5000;

export default class Channel  extends EventEmitter implements IChannel {

    protected channelNo:number;
    protected device: IAntDevice
    protected isScanner: boolean = false;
    protected isSensor: boolean = false;
    protected isWriting: boolean = false;
    protected messageQueue: MessageInfo[] = []
    protected props: ChannelProps

    constructor( channelNo:number, device:IAntDevice, props?:ChannelProps) {
        super()
        this.channelNo = channelNo
        this.device = device
        this.props = props || {}
    }

    onDeviceData(profile: string, deviceID: number, deviceState: any) {
        if (this.isScanner) {
            this.emit('detected',profile, deviceID)            
        }
        this.emit('data', profile, deviceID, deviceState)
    }

    getChannelNo(): number {
        return this.channelNo
    }
    getDevice(): IAntDevice {
        return this.device
    }

    setProps(props: ChannelProps) {
        this.props = props||{}
    }
    getProps(): ChannelProps {
        return this.props;
    }

    async startScanner(): Promise<boolean> {
        if (this.isSensor)
            await this.stopSensor()

        let to;
        try {
            to = setTimeout( ()=>{ throw new Error('timeout')},START_TIMEOUT)
            await this.sendMessage(Messages.assignChannel(this.channelNo, 'receive'));
            await this.sendMessage(Messages.setDevice(this.channelNo, 0, 0, 0));
            await this.sendMessage(Messages.setFrequency(this.channelNo, 57));
            await this.sendMessage(Messages.setRxExt());
            await this.sendMessage(Messages.libConfig(this.channelNo, 0xE0));
            await this.sendMessage(Messages.openRxScan());
            if (to) clearTimeout(to)
            this.isScanner = true;
            return this.isScanner	
        }
        catch(err) {
            if (to) clearTimeout(to)
            return false;
        }
    }

    async stopScanner(): Promise<boolean> { 
        if (!this.isScanner)
            return true
        
        await this.closeChannel();
        this.isScanner = false;
    }


    async startSensor(sensor: ISensor): Promise<boolean> {
        if (this.isScanner)
            await this.stopScanner()

        let to;
        try {
            to = setTimeout( ()=>{ throw new Error('timeout')},START_TIMEOUT)

            const {type,transmissionType,timeout,frequency,period} = sensor.getChannelConfiguration();
            const deviceID = sensor.getDeviceID();
            const deviceType = sensor.getDeviceType();

            await this.sendMessage(Messages.assignChannel(this.channelNo, type));
            await this.sendMessage(Messages.setDevice(this.channelNo, deviceID, deviceType, transmissionType));
            await this.sendMessage(Messages.searchChannel(this.channelNo, timeout));
            await this.sendMessage(Messages.setFrequency(this.channelNo, frequency));
            await this.sendMessage(Messages.setPeriod(this.channelNo, period));
            await this.sendMessage(Messages.libConfig(this.channelNo, 0xE0));
            await this.sendMessage(Messages.openChannel(this.channelNo));

            if (to) clearTimeout(to)

            this.attach(sensor)
            this.isSensor = true;
            return this.isSensor	
        }
        catch(err) {
            if (to) clearTimeout(to)
            return false;
        }

    }

    async stopSensor(): Promise<boolean> {
        if (!this.isSensor)
            return true;

        await this.closeChannel();
        this.isSensor = false;

    }

    protected async closeChannel(): Promise<void> {
        return new Promise ( resolve => {
            const onStatusUpdate = async (status)=> {
                if (status.msg===1 && status.code===Constants.EVENT_CHANNEL_CLOSED ) {
                    await this.sendMessage(Messages.unassignChannel(this.channelNo));
                    this.device.freeChannel(this)
                    this.off('status', onStatusUpdate)                    
                    resolve()    
                }
            }
            this.removeAllListeners()
            this.on('status', onStatusUpdate)
            this.device.write(Messages.closeChannel(this.channelNo));
        })
    }

    attach(sensor:ISensor): any {
        sensor.setChannel(this)
        this.on('message', (data) => {sensor.onMessage(data)})
        this.on('status', (status,data) => {sensor.onEvent(data)})
    }

    detach(sensor:ISensor){
        sensor.setChannel(null)
        this.off('message', (data) => {sensor.onMessage(data)})
        this.off('status', (status,data) => {sensor.onEvent(data)})
    }


    onMessage(data: Buffer): void {
        
        try {
            const messageID = data.readUInt8(Messages.BUFFER_INDEX_MSG_TYPE);
            const channel = data.readUInt8(Messages.BUFFER_INDEX_CHANNEL_NUM);
            const prevMsgId =  this.messageQueue.length>0 ? this.messageQueue[0].msgId : undefined
    
            
    
            // TODO: check for special messages ( e.g. broadcast, acknowledge,...)
            // TODO: check for status responses for those messages
    
            if (messageID === Constants.MESSAGE_CHANNEL_EVENT && channel === this.channelNo) {
                const status = {
                    msg: data.readUInt8(4),
                    code: data.readUInt8(5),
                };
    
                this.emit('status', status, data);
    
                const resolve = (value)  => {
                    if (this.messageQueue.length===0)
                        return;
                    const msg = this.messageQueue[0];
                    this.messageQueue.splice(0,1)
                    this.isWriting = false
                    msg.resolve(value)			
                }
    
                const next = () => {
                    if (this.messageQueue.length===0)
                        return;
                    const msg = this.messageQueue[0]
                    this.isWriting = true;
                    this.device.write(msg.data)
                    msg.data = undefined
                }
    
                if (status.msg!==1) {	// We have a response to the previous message
                    if (prevMsgId===status.msg)
                    {
                        resolve(status.code)
                        next()
                        return
                    }	
                }
                else {				// channel event, might relate to previous message

                    switch (status.code) {
                        case Constants.EVENT_TRANSFER_TX_COMPLETED:
                            resolve(true)
                            next();
                            return
                        case Constants.EVENT_TRANSFER_TX_FAILED:
                        case Constants.TRANSFER_IN_PROGRESS:
                        case Constants.TRANSFER_SEQUENCE_NUMBER_ERROR:
                        case Constants.TRANSFER_IN_ERROR:
                        case Constants.MESSAGE_SIZE_EXCEEDS_LIMIT:
                        case Constants.INVALID_MESSAGE:
                        case Constants.EVENT_CHANNEL_CLOSED:
                            resolve(false)
                            next();
                            return
                        
                        case Constants.EVENT_RX_SEARCH_TIMEOUT:
                            this.stopScanner()
                            return;
                        case Constants.EVENT_RX_FAIL:
                            // TODO: announce missed message / disconnect in case of too many errors?
                            break;
                        case Constants.EVENT_RX_FAIL_GO_TO_SEARCH:
                            // TODO: Announce diconnect
                            break;
                        case Constants.EVENT_CHANNEL_COLLISION:
                        // TODO
                            break;


                        
                    }
    
                }
    
        
            }
            else if (channel===this.channelNo)
                this.emit('message',data)
    
        }
        catch( err) {
            console.log(err)
        }

        
    }


    sendMessage(data: Buffer,logStr?:string): Promise<any> {
        const msgId = data.readUInt8(Messages.BUFFER_INDEX_MSG_TYPE)
		const channel = data.readUInt8(Messages.BUFFER_INDEX_CHANNEL_NUM);

           
		return new Promise( (resolve,reject) => {
            if (channel!==this.channelNo)
                reject( new Error('invalid channel'))

				if (this.isWriting) { 
                    // is there already an unsent message with same id? if so: skip and replace
                    let found = -1;
                    do {
                        found = this.messageQueue.findIndex( qi => qi.msgId ===msgId && qi.data)
                        if (found!==-1) {
                            const message = this.messageQueue[found]
                            this.messageQueue.splice(found,1)
                            message.resolve(false)
                        }
                    } while (found!==-1)
					this.messageQueue.push({msgId, resolve,data})

				}
				else {
					this.messageQueue.push({msgId, resolve})
					this.isWriting = true
                    if (logStr) {

                    }
					this.device.write(data)
				}
		})		

    }

}