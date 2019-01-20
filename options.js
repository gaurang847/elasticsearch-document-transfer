//Stuff you can play around with

module.exports = Object.freeze({
    "elasticsearch": {
        "log_level": "error",
        "scroll_time": "10s"
    },

    "buffer_size": 1000,

    "produce": {
        "batch_size": 100,
        "timeout": 1000             //in ms
    },

    "consume": {
        "batch_size": 50,
        "timeout": 1000,                //in ms
        "byFile": true,
        "byElastic": true
    }
})