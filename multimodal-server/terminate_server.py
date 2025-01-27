import time

from server import HOST, PORT
from socketio import Client, exceptions

sio = Client()

try:
  sio.connect(f'http://{HOST}:{PORT}', auth={'type': 'script'})

  sio.emit('script/terminate')

  time.sleep(1)

  sio.disconnect()

  print('Server terminated')
except exceptions.ConnectionError as e:
  print(f'Failed to connect to server (server not running?): {e}')
except Exception as e:
  print(f'Error: {e}')