import logging
from enum import Enum

from flask import request
from flask_socketio import emit

HOST = "127.0.0.1"
PORT = 5000

CLIENT_ROOM = "client"
SIMULATION_ROOM = "simulation"
SCRIPT_ROOM = "script"


class SimulationStatus(Enum):
    STARTING = "starting"
    PAUSED = "paused"
    RUNNING = "running"
    STOPPING = "stopping"
    COMPLETED = "completed"
    LOST = "lost"
    CORRUPTED = "corrupted"


def convert_string_to_enum(value, enum: Enum):
    for enum_value in enum:
        if value == enum_value.value:
            return enum_value
    return None


def getSessionId():
    return request.sid


def log(message, auth_type, level=logging.INFO):
    if auth_type == "server":
        logging.log(level, f"[{auth_type}] {message}")
        try:
            emit("log", f"{level} [{auth_type}] {message}", to=CLIENT_ROOM)
        except Exception as e:
            # This is to handle the case where the socket server is not running
            pass
    else:
        logging.log(level, f"[{auth_type}] {getSessionId()} {message}")
        emit("log", f"{level} [{auth_type}] {getSessionId()} {message}", to=CLIENT_ROOM)
