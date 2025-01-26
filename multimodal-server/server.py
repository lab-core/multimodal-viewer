import logging

from flask import Flask
from flask_socketio import SocketIO

HOST = '127.0.0.1'
PORT = 5000

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins='*')

@socketio.on('connect')
def on_connect():
  logging.info('Client connected')

@socketio.on('disconnect')
def on_disconnect():
  logging.info('Client disconnected')

@socketio.on('terminate')
def on_terminate():
  logging.info('Stopping server')
  socketio.stop()

if __name__ == '__main__':
  logging.basicConfig(level=logging.INFO)

  socketio.run(app, host=HOST, port=PORT)