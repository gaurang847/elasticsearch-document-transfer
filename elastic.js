const elasticsearch = require('elasticsearch');
const fs = require('fs');
const xl = require('exceljs');
const getByPath = require('lodash.get')


const config = require('./config');
const options = require('./options');


class Elastic{
    constructor(){
        this.target = {
            doc_count: {
                file: 0,
                elastic: 0
            }
        }
        this.batches = 0;
        this._scroll_id = null;
    }

    async init(){
        //configure source client
        this.sourceClient = new elasticsearch.Client({
            host: config.source.host,
            log: options.elasticsearch.log_level
        })
        await this._checkConnection(this.sourceClient, 'source');

        //configure target elastic client if required
        if(options.consume.byElastic){
            this.targetClient = new elasticsearch.Client({
                host: config.target.host,
                log: options.elasticsearch.log_level
            })
            await this._checkConnection(this.targetClient, 'target');

            if(config.target.importMappingFromSource)
                await this._transferMapping(this.sourceClient, this.targetClient);
        }

        //configure target file if required
        if(options.consume.byFile || options.consume.byXlsx)
            await this._mkdir(config.target.dirPath);

        if(options.consume.byXlsx){
            this.xlWorkbook = new xl.stream.xlsx.WorkbookWriter({
                stream: fs.createWriteStream(config.target.xlsxFilePath)
            });
            this.xlWorksheet = this.xlWorkbook.addWorksheet('Sheet 1');
            this.xlWorksheet.columns = Object.keys(config.target.rawHitToXlsxPaths).map(path => ({header: path}));
        }
    }

    async getDocsFromSourceElastic(){
        let results;

        //the first time; when scroll_id isn't generated yet
        if(!this._scroll_id){
            results = await this.sourceClient.search({
                scroll: options.elasticsearch.scroll_time,
                index: config.source.index,
                type: config.source.type,
                body: {
                    size: options.produce.batch_size,
                    query: options.elasticsearch.query
                }
            })
        }
        //rest of the times
        else{
            results = await this.sourceClient.scroll({
                scrollId: this._scroll_id,
                scroll: options.elasticsearch.scroll_time
            })
        }
        this.batches++;
        this._scroll_id = results._scroll_id;

        console.log('Batches produced: ', this.batches);
        return results
    }

    addDocsToTargetElastic(rawHitsList){
        let body = rawHitsList.reduce((accumulator, hit) => {
            let docCount = this._getUpdatedDocCount('elastic');
            
            let index = {
                _index: config.target.index,
                _type: config.target.type
            }
            
            if(config.target.useDocCountAsId)
                index._id = docCount;

            return accumulator.concat([{index}, hit._source])
        }, []);

        console.log('Docs transferred (elastic): ', this.target.doc_count.elastic);
        return this.targetClient.bulk({body});
    }

    async writeDocsToFile(rawHitsList){
        let body = rawHitsList.map(hits => {
            let path = config.target.dirPath + config.target.filePath;
            let docCount = this._getUpdatedDocCount('file')
            
            let index = {
                _index: config.target.index,
                _type: config.target.type
            }
            
            if(config.target.useDocCountAsId)
                index._id = docCount;

            return this._writeLineToFile(path, `${JSON.stringify({index})}\n${JSON.stringify(hits._source)}`);
        })

        console.log('Docs transferred (file): ', this.target.doc_count.file);
        return Promise.all(body);     
    }

    async writeDocsToXLSX(rawHitsList){
        return rawHitsList.map(hit => {
            let row = Object.values(config.target.rawHitToXlsxPaths)
            .reduce((acc, path) => acc.concat([getByPath(hit, path)]), []);

            return this.xlWorksheet.addRow(row).commit();
        })
    }

    async commitWorkbook(){
        this.xlWorkbook.commit();
    }

    async _checkConnection(client, clientName = ''){
        await client.ping({requestTimeout: 3000});
        console.log(`${clientName} client connected successfully`);
    }

    _getUpdatedDocCount(target_type){
        return ++this.target.doc_count[target_type];
    }

    _writeLineToFile(path, line){
        line = line + '\n';
        return new Promise((resolve, reject) => {
            fs.appendFile(path, line, err => err? reject(err): resolve());
        })
    }

    _mkdir(path){
        return new Promise((resolve, reject) => {
            fs.mkdir(path, err => {
                //if any error other than 'directory already exists'
                if (err && err.code != 'EEXIST')
                    reject(err);
                resolve();
            })
        })
    }

    async _transferMapping(source, target){
        let sourceMapping = await source.indices.getMapping({
            index: config.source.index,
            type: config.source.type
        })

        let mapping = this._buildMappingFrom(sourceMapping);

        if(!await target.indices.exists({index: config.target.index}))
            await target.indices.create({index: config.target.index});

        return await target.indices.putMapping({
            index: config.target.index,
            type: config.target.type,
            body: mapping
        });
    }

    //sourceMapping:
    //{<index>: {"mappings": {<type>: {<the mapping>}}}}
    //To return:
    //{<type>: <mapping>}
    _buildMappingFrom(sourceMapping){
        let base = {};
        let type = Object.assign({}, sourceMapping[config.source.index].mappings[config.source.type]);

        //if target 'type' given in config is different from the type in source elastic, change it
        if(this._targetConfigCheckIf('type', 'given') && !this._targetConfigCheckIf('type', 'same'))
            base[config.target.type] = type;
        else
            base[config.source.type] = type;

        //base = {<type>: <mapping>}
        return base;
    }

    _targetConfigCheckIf(property, flag){
        switch(flag){
            case 'given': return !!config.target[property];
            case 'same': return config.target[property] === config.source[property];
            default: throw new Error(`Error with mapping: ${property}`);
        }
    }
}

module.exports = {Elastic}