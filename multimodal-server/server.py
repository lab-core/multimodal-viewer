import logging
import multiprocessing
import time

from flask import Flask, request
from flask_socketio import SocketIO, emit
from simulation import run_simulation

HOST = '127.0.0.1'
PORT = 5000

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins='*')

instances = dict()

def getSessionId():
    return request.sid

def log(message, auth_type, level=logging.INFO):
    if auth_type == 'server':
        logging.log(level, f"{time.strftime('%H:%M:%S')} [{auth_type}] {message}")
    else:
        logging.log(level, f"{time.strftime('%H:%M:%S')} {getSessionId()} [{auth_type}] {message}")

# MARK: Main events
@socketio.on('connect')
def on_connect(auth):
    auth_type = auth['type']
    log('connected', auth_type)
    instances[getSessionId()] = auth_type

@socketio.on('disconnect')
def on_disconnect(reason):
    log(f'disconnected: {reason}', instances[getSessionId()])
    instances.pop(getSessionId())

# MARK: Client events
@socketio.on('client/startSimulation')
def on_client_start_simulation(name):
    log(f"starting simulation {name}", 'client')
    multiprocessing.Process(target=run_simulation, args=(name,)).start()

# MARK: Script events
@socketio.on('script/terminate')
def on_script_terminate():
    log('terminating server', 'script')
    time.sleep(1)
    socketio.stop()

# MARK: Simulation events
@socketio.on('simulation/ended')                
def on_simulation_end(name):
    log(f"simulation {name} ended", 'simulation')
    emit('client/simulationEnded', name, broadcast=True)


# MARK: Server
def run_server():
    logging.basicConfig(level=logging.INFO)

    log(f"Starting server at {HOST}:{PORT}", 'server')
    
    socketio.run(app, host=HOST, port=PORT)

if __name__ == '__main__':
    run_server()