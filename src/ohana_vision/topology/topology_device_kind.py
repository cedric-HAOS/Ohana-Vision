"""Kinds of devices represented in the infrastructure topology."""

from enum import StrEnum


class TopologyDeviceKind(StrEnum):
    """Identify the visual and functional kind of a topology device."""

    INTERNET = "internet"
    ROUTER = "router"
    SWITCH = "switch"
    ACCESS_POINT = "access_point"
    SERVER = "server"
    RASPBERRY_PI = "raspberry_pi"
    HOME_ASSISTANT = "home_assistant"
    CAMERA = "camera"
    SMART_DEVICE = "smart_device"
    ZWAVE_MODULE = "zwave_module"
    SOLAR = "solar"
    COMPUTER = "computer"
    STORAGE = "storage"
    OTHER = "other"
