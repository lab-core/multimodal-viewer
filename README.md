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

## Installing the python packages

This little script will install all Python-related things you need to run the project.

```bash
# Creating and activating Python environment (Optional)
py -3.11 -m venv venv
.\venv\Scripts\activate

# Upgrading pip
python -m pip install --upgrade pip

# Updating submodule
git submodule update --init --recursive
cd multimodal-simulator
git checkout develop-visualizer
git pull origin develop-visualizer

# Installing the submodule package
cd python
python -m pip install -r requirements.txt
python setup.py install

# Installing the project package
cd ../..
pip install -e .
```


## Launching 

Once you have installed all the packages, you have a few ways to run the project

### Python

Open two separate terminals and activate the Python environment if you have created one. Launch the front-end with `multimodal-ui` 
in the first terminal, and the back-end with `multimodal-server` in the second.

### Angular

Install all the angular dependencies:

```bash
cd multimodal-ui
npm ci
```

Serve the application with `npm start`

Launch the server in a separate terminal with `multimodal-server`. Do not forget to activate the Python environment if you have created one.


## Rebuilding the Frontend

If you made changes to the frontend, you might want to rebuild it to be able to run it without Angular later.

```bash
cd multimodal-ui
npm run build
```

Once the build is finished, copy the contents of `multimodal-ui/dist/multimodal-ui/browser/` into `multimodal_ui/static/`

## Changing Ports

The ports are defined in the .env file. After changing them, restart both the front and the back ends for the changes to take effect.

If you are unning the app through the python package and do not wish to rebuild it with angular, you will also have to change the ports directly in the build. 
In the `/multimodal_ui/static/main-XXXXXXXX.js` file, locate this section:
`socketUrl:"http://127.0.0.1:8089",apiUrl:"http://127.0.0.1:8089/api/",clientPort:8085`
and replace the ports to match the ones you redefined in your .env file.

Reinstall the python package for good mesure.
