export enum Constants {
	MESSAGE_TX_SYNC = 0xA4,
	DEFAULT_NETWORK_NUMBER = 0x00,

	// Configuration messages
	MESSAGE_CHANNEL_UNASSIGN = 0x41,
	MESSAGE_CHANNEL_ASSIGN = 0x42,
	MESSAGE_CHANNEL_ID = 0x51,
	MESSAGE_CHANNEL_PERIOD = 0x43,
	MESSAGE_CHANNEL_SEARCH_TIMEOUT = 0x44,
	MESSAGE_CHANNEL_FREQUENCY = 0x45,
	MESSAGE_CHANNEL_TX_POWER = 0x60,
	MESSAGE_NETWORK_KEY = 0x46,
	MESSAGE_TX_POWER = 0x47,
	MESSAGE_PROXIMITY_SEARCH = 0x71,
	MESSAGE_ENABLE_RX_EXT = 0x66,
	MESSAGE_LIB_CONFIG = 0x6E,
	MESSAGE_CHANNEL_OPEN_RX_SCAN = 0x5B,

	// Notification messages
	MESSAGE_STARTUP = 0x6F,

	// Control messages
	MESSAGE_SYSTEM_RESET = 0x4A,
	MESSAGE_CHANNEL_OPEN = 0x4B,
	MESSAGE_CHANNEL_CLOSE = 0x4C,
	MESSAGE_CHANNEL_REQUEST = 0x4D,

	// Data messages
	MESSAGE_CHANNEL_BROADCAST_DATA = 0x4E,
	MESSAGE_CHANNEL_ACKNOWLEDGED_DATA = 0x4F,
	MESSAGE_CHANNEL_BURST_DATA = 0x50,
	// MESSAGE_CHANNEL_ADVANCED_BURST_DATA = 

	// Channel event messages
	MESSAGE_CHANNEL_EVENT = 0x40,

	// Requested response messages
	MESSAGE_CHANNEL_STATUS = 0x52,
	//MESSAGE_CHANNEL_ID = 0x51,
	MESSAGE_VERSION = 0x3E,
	MESSAGE_CAPABILITIES = 0x54,
	MESSAGE_SERIAL_NUMBER = 0x61,

	// Message parameters
	CHANNEL_TYPE_TWOWAY_RECEIVE = 0x00,   // Bidirectional Slave Channel
	CHANNEL_TYPE_TWOWAY_TRANSMIT = 0x10,  // Bidirectional Master Channel
	CHANNEL_TYPE_SHARED_RECEIVE = 0x20,   // Shared Bidirectional Slave Channel
	CHANNEL_TYPE_SHARED_TRANSMIT = 0x30,  // Shared Bidirectional Master Channel
	CHANNEL_TYPE_ONEWAY_RECEIVE = 0x40,   // Slave Receive Only Channel (diagnostic)
	CHANNEL_TYPE_ONEWAY_TRANSMIT = 0x50,  // Master Transmit Only Channel (legacy)
	RADIO_TX_POWER_MINUS20DB = 0x00,
	RADIO_TX_POWER_MINUS10DB = 0x01,
	RADIO_TX_POWER_0DB = 0x02,
	RADIO_TX_POWER_PLUS4DB = 0x03,
	RESPONSE_NO_ERROR = 0x00,

	// Events
	EVENT_RX_SEARCH_TIMEOUT = 0x01,
	EVENT_RX_FAIL = 0x02,
	EVENT_TX = 0x03,
	EVENT_TRANSFER_RX_FAILED = 0x04,
	EVENT_TRANSFER_TX_COMPLETED = 0x05,
	EVENT_TRANSFER_TX_FAILED = 0x06,
	EVENT_CHANNEL_CLOSED = 0x07,
	EVENT_RX_FAIL_GO_TO_SEARCH = 0x08,
	EVENT_CHANNEL_COLLISION = 0x09,
	EVENT_TRANSFER_TX_START = 0x0A,
	CHANNEL_IN_WRONG_STATE = 0x15,
	CHANNEL_NOT_OPENED = 0x16,
	CHANNEL_ID_NOT_SET = 0x18,
	CLOSE_ALL_CHANNELS = 0x19,
	TRANSFER_IN_PROGRESS = 0x1F,
	TRANSFER_SEQUENCE_NUMBER_ERROR = 0x20,
	TRANSFER_IN_ERROR = 0x21,
	MESSAGE_SIZE_EXCEEDS_LIMIT = 0x27,
	INVALID_MESSAGE = 0x28,
	INVALID_NETWORK_NUMBER = 0x29,
	INVALID_LIST_ID = 0x30,
	INVALID_SCAN_TX_CHANNEL = 0x31,
	INVALID_PARAMETER_PROVIDED = 0x33,
	EVENT_QUEUE_OVERFLOW = 0x35,
	USB_STRING_WRITE_FAIL = 0x70,
	CHANNEL_STATE_UNASSIGNED = 0x00,
	CHANNEL_STATE_ASSIGNED = 0x01,
	CHANNEL_STATE_SEARCHING = 0x02,
	CHANNEL_STATE_TRACKING = 0x03,
	CAPABILITIES_NO_RECEIVE_CHANNELS = 0x01,
	CAPABILITIES_NO_TRANSMIT_CHANNELS = 0x02,
	CAPABILITIES_NO_RECEIVE_MESSAGES = 0x04,
	CAPABILITIES_NO_TRANSMIT_MESSAGES = 0x08,
	CAPABILITIES_NO_ACKNOWLEDGED_MESSAGES = 0x10,
	CAPABILITIES_NO_BURST_MESSAGES = 0x20,
	CAPABILITIES_NETWORK_ENABLED = 0x02,
	CAPABILITIES_SERIAL_NUMBER_ENABLED = 0x08,
	CAPABILITIES_PER_CHANNEL_TX_POWER_ENABLED = 0x10,
	CAPABILITIES_LOW_PRIORITY_SEARCH_ENABLED = 0x20,
	CAPABILITIES_SCRIPT_ENABLED = 0x40,
	CAPABILITIES_SEARCH_LIST_ENABLED = 0x80,
	CAPABILITIES_LED_ENABLED = 0x01,
	CAPABILITIES_EXT_MESSAGE_ENABLED = 0x02,
	CAPABILITIES_SCAN_MODE_ENABLED = 0x04,
	CAPABILITIES_PROX_SEARCH_ENABLED = 0x10,
	CAPABILITIES_EXT_ASSIGN_ENABLED = 0x20,
	CAPABILITIES_FS_ANTFS_ENABLED = 0x40,
	TIMEOUT_NEVER = 0xFF,
}

export default class Test {}