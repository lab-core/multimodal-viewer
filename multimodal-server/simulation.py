import time

from socketio import Client

HOST = '127.0.0.1'
PORT = 5000

def run_simulation(name):
    sio = Client()

    sio.connect(f'http://{HOST}:{PORT}', auth={'type': 'simulation'})

    time.sleep(5)

    sio.emit('simulation/ended', name)

    time.sleep(1)

    sio.disconnect()