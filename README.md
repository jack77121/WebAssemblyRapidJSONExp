# Purpose
Pack a smart contract in a C++ class, and handle input/output states as JSON format with RapidJSON.

# Usage
## Quick start
1. Clone this repo `$ git clone https://github.com/jack77121/WebAssemblyRapidJSONExp.git`.
2. Go into the directory `$ cd WebAssemblyRapidJSONExp`.
3. Start a python simple server (or any other server you love) `$ python -m SimpleHTTPServer 8001`, 8001 is the port number, change it as you like.
4. Open a browser (I used FirefoxDeveloperEdition for the repo), go to `http://localhost:8001/TransferFunctionSample.html`, 8001 is the port number, should be the same in step 3.
3. You should see a sample result right now in your browser, open `TransferFunctionSample.html` in your favorite editor, and get more detail about how to use it in your own project.

## Customer start
(coming soon)
<!-- Include `json_handler.js`, ex. `<script src="json_handler.js"></script>` in your html.  -->

# Function

## std::string MyContract::TransferCoin_A2B(const std::string& A, const std::string& B, const int& transferValue)

 * DESC     - Transfer Coin from A address to B address
 * Input    - A's address, B's address, Transfer amount
 * Output   - Current contract state in JSON format
 
(coming soon)

