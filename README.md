# Final Project In Software Engineering - Project 8

## Test Data

Some test data are available in the `data/` folder to test the program. The `instance_16` and `instance_full_day` data are not available on GitHub due to their size but we can provide them on request.

## Submodule

The `multimodal-simulator` submodule is available in the `multimodal-simulator` folder. When updating your local repository, you can use the following command to update the submodule :

```bash
git submodule update --init --recursive
cd multimodal-simulator
git checkout develop-visualizer
git pull origin develop-visualizer
```

## Setting Up the Backend

Running the backend requires a python environment

```bash
# Creating Python environment
py -3.11 -m venv venv
.\venv\Scripts\activate

# Upgrading pip
python -m pip install --upgrade pip

# Updating submodule
git submodule update --init --recursive
cd multimodal-simulator
git checkout develop-visualizer
git pull origin develop-visualizer

# Installing Python package
cd python
python -m pip install -r requirements.txt
python setup.py install

# Installing Server Requirements
cd ../../multimodal-server
python -m pip install -r requirements.txt

# Leaving the environment
cd ..
deactivate
```

## Serving With Angular

First, start your server:

```bash
.\venv\Scripts\activate
cd multimodal-server
python .\server.py
```

Then, open a new terminal and install all the angular dependencies:

```bash
cd multimodal-ui
npm ci
```

Serve the application with `npm start`

## Launching Without Angular

First make sure to install the python package :

```bash
cd multimodal-ui-python
pip install -e .
cd ..
```

Now you have a few options to run the project.

### Using launch.py

You can run it via `launch.py`. This should work on Windows, MacOS, and some Linux configurations.

```bash
python .\launch.py
```

### Running frontend and the backend separately

If `launch.py` fails for you, you can run the frontend with:

```bash
multimodal-ui
```

Then you can run the server in a separate terminal:

```bash
.\venv\Scripts\activate
cd multimodal-server
python .\server.py
```

### Running with one command line

From the root of the project, execute tis line in powershell:

```bash
Start-Process powershell -ArgumentList "-NoExit", "-Command", "multimodal-ui"; .\venv\Scripts\activate; cd .\multimodal-server; python .\server.py
```

### Running in Docker

Make sure you have Docker installed on your machine first. Then run `docker-compose` from the root of the project.

## Rebuilding the Frontend

If you made changes to the frontend, you might want to rebuild it to be able to run it without Angular later.

```bash
cd multimodal-ui
npm run build
```

Once the build is finished, copy the contents of `multimodal-ui/dist/multimodal-ui/browser/` into `multimodal-ui-python/multimodal_ui/static/`

## Changing Ports

The ports are defined in the .env file. After changing them, restart both the front and the back ends for the changes to take effect.

If you are using running the app through the python package and do not wish to rebuild it with angular, you will also have to change the ports directly in the built main file. In the
`/multimodal-ui-python/multimodal_ui/static/main-XXXXXXXX.js`
file, locate this section:
`socketUrl:"http://127.0.0.1:8089",apiUrl:"http://127.0.0.1:8089/api/",clientPort:8085`
and replace the ports to match the ones you redefined in your .env file.

Reinstall the python package for good mesure.
