// Load environment from `public/environment.json` file

function loadEnvironment() {
  let xhr = new XMLHttpRequest();
  xhr.open("GET", "/environment.json", false);
  xhr.onreadystatechange = function () {
    if (xhr.readyState === XMLHttpRequest.DONE && xhr.status === 200) {
      window.environment = JSON.parse(xhr.responseText);
      console.log(`Environment loaded successfully: ${xhr.responseText}`);
      return;
    }

    console.error(
      `Failed to load environment: ${xhr.status} ${xhr.statusText}`,
    );
  };
  xhr.send();
}

loadEnvironment();
