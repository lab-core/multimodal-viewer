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

## Python Environment

Here is my personal setup for the Python environment :

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
```
