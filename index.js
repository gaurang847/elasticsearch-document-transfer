const Elastic = require('./elastic').Elastic;
const events = require('events');

const options = require('./options');

const elastic = new Elastic();
const eventEmitter = new events.EventEmitter();

let buffer = [];
let EOS = false;            //End Of Scroll/Search

const EVENT_CONSUME_READY = 'BUFFER_CONSUME_READY';
const EVENT_PRODUCE_READY = 'BUFFER_PRODUCE_READY';

//to push documents to target
eventEmitter.on(EVENT_CONSUME_READY, async () => {
    try{
        while(buffer.length > options.consume.batch_size){
            let batch = buffer.splice(0, options.consume.batch_size);

            if(options.consume.byFile)
                await elastic.writeDocsToFile(batch);
            
            if(options.consume.byElastic)
                await elastic.addDocsToTargetElastic(batch);
        }

        console.log('consumeSkip');
        if(!EOS)
            setTimeout(() => eventEmitter.emit(EVENT_CONSUME_READY), options.consume.timeout);
        else{
            if(options.consume.byFile)
                await elastic.writeDocsToFile(buffer);
                
            if(options.consume.byElastic)
                await elastic.addDocsToTargetElastic(buffer);
        }
    }
    catch(err){console.error(err)}
});

//to get documents from source elastic
eventEmitter.on(EVENT_PRODUCE_READY, async () => {
    let response;
    try{
        while(buffer.length < options.buffer_size){
            response = await elastic.getFromRemoteElastic(options.produce.batch_size);
            
            if(response.hits.hits.length > 0)
                buffer = buffer.concat(response.hits.hits);
            else{
                EOF = true;
                break;
            }
        }

        console.log('produceSkip');
        if(!EOS)
            setTimeout(() => eventEmitter.emit(EVENT_PRODUCE_READY), options.produce.timeout);
    }
    catch(err){console.error(err)}
});

(async function() {
    await elastic.init();
    eventEmitter.emit(EVENT_CONSUME_READY);
    eventEmitter.emit(EVENT_PRODUCE_READY);
})();