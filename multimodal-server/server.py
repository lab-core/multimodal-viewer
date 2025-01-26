import logging
import time

from flask import Flask, request
from flask_socketio import SocketIO, emit

HOST = '127.0.0.1'
PORT = 5000

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins='*')

connected_sockets = dict()

def getSessionId():
  return request.sid

@socketio.on('connect')
def on_connect(auth):
  connected_sockets[getSessionId()] = auth
  logging.info(f"{time.strftime('%H:%M:%S')} {getSessionId()} {auth} connected")

@socketio.on('disconnect')
def on_disconnect(reason):
  auth = connected_sockets.pop(getSessionId())
  logging.info(f"{time.strftime('%H:%M:%S')} {getSessionId()} {auth} disconnected")

@socketio.on('terminate')
def on_terminate():
  auth = connected_sockets[getSessionId()]
  logging.info(f"{time.strftime('%H:%M:%S')} {getSessionId()} {auth} terminating server")
  time.sleep(1)
  socketio.stop()

if __name__ == '__main__':
  logging.basicConfig(level=logging.INFO)

  socketio.run(app, host=HOST, port=PORT)