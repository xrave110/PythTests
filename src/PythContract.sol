// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {console2} from "forge-std/Test.sol";
import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";

contract PythContract {
    IPyth pyth;
    bytes32 ethUsdPriceId;

    // Error raised if the payment is not sufficient
    error InsufficientFee();

    constructor(address _pyth, bytes32 _ethUsdPriceId) {
        pyth = IPyth(_pyth);
        ethUsdPriceId = _ethUsdPriceId;
    }

    function mint() public payable {
        PythStructs.Price memory price = pyth.getPriceNoOlderThan(ethUsdPriceId, 60);

        uint256 ethPrice18Decimals =
            (uint256(uint64(price.price)) * (10 ** 18)) / (10 ** uint8(uint32(-1 * price.expo)));
        uint256 oneDollarInWei = ((10 ** 18) * (10 ** 18)) / ethPrice18Decimals;

        // console2.log("required payment in wei");
        // console2.log(oneDollarInWei);

        if (msg.value >= oneDollarInWei) {
            // User paid enough money.
            // TODO: mint the NFT here
        } else {
            revert InsufficientFee();
        }
    }

    function updateAndMint(bytes[] calldata pythPriceUpdate) external payable {
        uint256 updateFee = pyth.getUpdateFee(pythPriceUpdate);
        pyth.updatePriceFeeds{value: updateFee}(pythPriceUpdate);

        mint();
    }
}
