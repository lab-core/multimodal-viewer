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

# key = session id, value = auth type
instances = dict()

simulation_process_by_name = dict()
simulation_session_id_by_name = dict()
simulation_name_by_session_id = dict()

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
    auth_type = instances.pop(getSessionId())
    log(f'disconnected: {reason}', auth_type)

    # When a simulation client disconnects, we need to clean up the server
    if auth_type == 'simulation':
        if not getSessionId() in simulation_name_by_session_id:
            return
        name = simulation_name_by_session_id.pop(getSessionId())
        simulation_session_id_by_name.pop(name)
        process = simulation_process_by_name.pop(name)
        process.terminate()
        process.join()
        emit('client/simulationEnded', name)

# MARK: Client events
@socketio.on('client/startSimulation')
def on_client_start_simulation(name):
    # Check if a simulation with this name is already running
    if name in simulation_process_by_name:
        log(f"simulation {name} already running", 'client')
        emit('client/simulationAlreadyRunning', name)
        return
    
    log(f"starting simulation {name}", 'client')
    simulation_process = multiprocessing.Process(target=run_simulation, args=(name,))
    simulation_process.start()
    simulation_process_by_name[name] = simulation_process
    emit('client/simulationStarted', name)
    
@socketio.on('client/stopSimulation')
def on_client_stop_simulation(name):
    # Check if a simulation with this name is running
    if name not in simulation_process_by_name:
        log(f"simulation {name} not running", 'client')
        emit('client/simulationNotRunning', name)
        return

    log(f"stopping simulation {name}", 'client')
    simulation_session_id = simulation_session_id_by_name[name]
    simulation_name_by_session_id.pop(simulation_session_id)
    simulation_process_by_name.pop(name)
    emit('simulation/simulationEnd', to=simulation_session_id)
    emit('client/simulationEnded', name)

@socketio.on('client/pauseSimulation')
def on_client_pause_simulation(name):
    if name not in simulation_process_by_name:
        log(f"simulation {name} not running", 'client')
        emit('client/simulationNotRunning', name)
        return
    # Le log de la simulation dit deja que c'est en pause
    log(f"pausing simulation {name}", 'client')
    simulation_session_id = simulation_session_id_by_name[name]
    emit('simulation/pauseSimulation', to=simulation_session_id)

@socketio.on('client/resumeSimulation')
def on_client_resume_simulation(name):
    if name not in simulation_process_by_name:
        log(f"simulation {name} not running", 'client')
        emit('client/simulationNotRunning', name)
        return
    
    # Le log de la simulation dit deja que c'est resumed
    log(f"resuming simulation {name}", 'client')
    simulation_session_id = simulation_session_id_by_name[name]
    emit('simulation/resumeSimulation', to=simulation_session_id)

# MARK: Script events
@socketio.on('script/terminate')
def on_script_terminate():
    log('terminating server', 'script')

    # Terminate all running simulations
    for name, process in simulation_process_by_name.items():
        process.terminate()
        process.join()
    
    time.sleep(1)
    
    socketio.stop()

# MARK: Simulation events
@socketio.on('simulation/started')
def on_simulation_start(name):
    log(f"simulation {name} started", 'simulation')
    emit('client/simulationStarted', name)
    simulation_name_by_session_id[getSessionId()] = name
    simulation_session_id_by_name[name] = getSessionId()

@socketio.on('simulation/ended')                
def on_simulation_end(name):
    log(f"simulation {name} ended", 'simulation')
    emit('client/simulationEnded', name)

# MARK: Server
def run_server():
    logging.basicConfig(level=logging.INFO)

    log(f"Starting server at {HOST}:{PORT}", 'server')
    
    socketio.run(app, host=HOST, port=PORT)

if __name__ == '__main__':
    run_server()