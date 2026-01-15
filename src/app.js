var files = {};
//map of ids to files for faster lookup
var lookupTable = {}

//local storage
const indexKey = "org.forager.fileIndex"
const filePrefix = "org.forager.file."

const loadFromStorage = () => {
    console.log("load from storage")
    fileIndex = JSON.parse(localStorage.getItem(indexKey))
    console.log("index", fileIndex)
    if (fileIndex === null) {
        return
    }

    var readFiles = {};
    for (index of fileIndex) {
        console.log("loading", index)
        readFiles[index] = JSON.parse(localStorage.getItem(filePrefix + index))
    }
    files = readFiles;
    repopulateFileDisp();
    loadIndex()
}

const addFile = (fileObj) => {
    const index = fileObj.series == "" ? fileObj.name : fileObj.series
    
    if (files[index] !== undefined ) {
        console.log("series match, comparing dates")
        if (files[index].date >= fileObj.date) {
            console.log("dropping new file that is not newer")
            return
        }
        //TODO: warn in UI for overwrite
        console.log("Replacing file of " + files[index].rows.length + " rows, with " + fileObj.rows.length)
    }
    files[index] = fileObj;
    localStorage.setItem(indexKey, JSON.stringify(Object.keys(files)))
    localStorage.setItem(filePrefix + index, JSON.stringify(fileObj));
    repopulateFileDisp();
    loadIndex()
}

const deleteFile = (fileIndex) => {
    if (delete files[fileIndex]) {
        console.log("delete success")
    } else {
        console.log("delete failure")
    }
    console.log("post deleting", fileIndex, files)
    localStorage.removeItem(filePrefix + fileIndex)
    localStorage.setItem(indexKey, JSON.stringify(Object.keys(files)))

    repopulateFileDisp();
    loadIndex()
}

const repopulateFileDisp = () => {
    const filesDisp = document.getElementById('loaded-files');
    filesDisp.innerHTML = "";
    const fileCount = Object.keys(files).length;
    if (fileCount > 0) {
        const title = document.createElement('h3')
        const footer = fileCount == 1 ? "file" : "files"
        title.textContent = "Searching " + fileCount + ' ' + footer
        title.style.color = 'white'
        filesDisp.appendChild(title)

        for (const [key, value] of Object.entries(files)) {
            const container = document.createElement('div')
            container.style.display = 'flex'
            container.style.flexDirection = 'row'
            container.style.marginTop = "0px"
            filesDisp.appendChild(container)

            const label = document.createElement('div')
            label.textContent = value.name
            label.style.color =  "white"
            container.appendChild(label);

            const space = document.createElement('div')
            space.style.display = 'flex'
            space.style.flexGrow = 1
            container.appendChild(space)

            const btn = document.createElement('button');
            btn.textContent = "Remove";
            btn.addEventListener('click', () => {
                console.log("selected delete", key)
                deleteFile(key);
            });
            container.appendChild(btn);

            const options = {
                month: 'short',
                day: 'numeric'
            };
            const dateFormatter = new Intl.DateTimeFormat('en-US', options);
            const dateLabel = document.createElement('div')
            dateLabel.textContent = dateFormatter.format(value.date)
            dateLabel.style.color =  "white"
            container.appendChild(dateLabel);
        }
        document.getElementById('loaded-files').removeAttribute('hidden');
        document.getElementById('files-footer').removeAttribute('hidden');
        document.getElementById('start-load').style.setProperty('display', 'none');
        hideIntro()
        showSearch()
    } else {
        document.getElementById('loaded-files').setAttribute('hidden', ''); 
        document.getElementById('files-footer').setAttribute('hidden', ''); 
        document.getElementById('start-load').style.removeProperty('display');
        showIntro()
        hideSearch()
    }
}

//expensive iteration over all loaded files
const loadIndex = () => {
    lookupTable = {}
    for (const [key, value] of Object.entries(files)) {
        for (row of value.rows) {
            const upperIndex = row.identifier.toUpperCase()
            if (!lookupTable[upperIndex]) {
                lookupTable[upperIndex] = {}
            }

            lookupTable[upperIndex][key] = true
        }
    }
    console.log("Lookup table", lookupTable)
}

// TODO: Adding file twice deletes other file???

//files get processed into a Dataset object with properties
//name: string userset, fallback to filename
//series: string, replacement index
//date: date
//lines: 

const submitFile = (e) => {
    e.preventDefault();

    const fileName = e.target.fileinput.files[0].name 
    const inputName = document.forms["FileInput"]["datasetName"].value

    const datasetName = inputName ? inputName : fileName

    console.log("Dataset name", datasetName)
    const reader = new FileReader();

    reader.onload = (event) => {
        const fileObj = dataSetFromCSV(event.target.result, datasetName)
        console.log("Parsed result", fileObj)
        try {
            addFile(fileObj);
        } catch(err) {
            //TODO: present this in the UI
            console.log("failed to process file with error", err)
        }
        
    };

    reader.readAsText(e.target.fileinput.files[0]);
}

const tableBreak = "table begins"
const seriesKey = "series"
const dateKey = "date"
const dataSetFromCSV = (f, n) => {
    let result = parse(f)
    console.log("parse result", result)

    var keysValues = {}
    var columnLineNo = undefined
    //read kv pairs until we reach the delimeter
    for (var lineNo = 0; lineNo < result.length; lineNo++) {
        //ipnore empty lines
        if (result[lineNo][0] == undefined) {
            console.log("row with empty leading value")
            continue
        }
        if (tableBreak.localeCompare(result[lineNo][0], undefined, { sensitivity: 'base' } ) == 0 ) {
            columnLineNo = lineNo + 1
            break
        }

        //otherwise, process as key
        if (result[lineNo][1] == undefined) {
            console.log("row with empty leading value")
            continue
        }
        if (seriesKey.localeCompare(result[lineNo][0], undefined, { sensitivity: 'base' } ) == 0) {
            keysValues[seriesKey] = result[lineNo][1]
        } else if (dateKey.localeCompare(result[lineNo][0], undefined, { sensitivity: 'base' } ) == 0 ) {
            keysValues[dateKey] = result[lineNo][1]
        }
     }

    if (columnLineNo === undefined) {
        console.log("no table start marker found, assuming table starts at 0")
        columnLineNo = 0
    }
    if (columnLineNo + 1 === result.length) {
        throw new Error("no content found in file", columnLineNo,  result.length)
    }

    let dateValue = keysValues[dateKey] === undefined ? undefined : Date.parse(keysValues[dateKey])
    let seriesValue = keysValues[seriesKey] === undefined ? crypto.randomUUID() : keysValues[seriesKey]

    var rows = []
    for (var valueRow = columnLineNo + 1; valueRow < result.length; valueRow++) {
        const row = result[valueRow]
        if (row === undefined) { continue }
        //treat the leading row as identifier
        if (row[0] === undefined) { continue }

        rows.push( {
            identifier: row[0].replace(/ /g,''),
            content: row.slice(1)
        } )
    }

    return {
        name: n, //for display
        date: (dateValue === undefined) ? Date.now() : dateValue,
        series: seriesValue, //for deduping
        columns: result[columnLineNo], //keys
        rows: rows 
    }
}

const clearResults = () => {
    document.getElementById('results-content').innerHTML = "";
    document.getElementById('results').style.setProperty('display', 'none');
    document.getElementById('results-instructions').style.removeProperty('display');
}

const changedSearch = () => {
    const searchValue = document.forms["SearchInput"]["searchField"].value
    
    if (!searchValue) { 
        clearResults()
        return
    }

    if (searchValue.length < 2) { 
        clearResults()
        return
    }

     const matchingIdentifiers = Object.keys(lookupTable)
        .filter( (identifier) => identifier.includes(searchValue.toUpperCase()) )
    console.log("matching results", matchingIdentifiers)
    showResults(matchingIdentifiers)
}

const showResults = (matches) => {
    const display_div = document.getElementById('results-content');
    display_div.innerHTML = "";

    const para = document.createElement('div')
    const footer = matches.length == 1 ? "result" : "results"
    para.textContent = "Found " + matches.length + " " + footer
    para.style.color =  "white"
    display_div.appendChild(para);

    display_div.appendChild(document.createElement('br'));

    console.log("matches", matches)
    if (matches.length  < maxResults) {
        for (result of matches) {
            console.log("results row", result)
            showResult(result, display_div)
        }
    }

    display_div.appendChild(document.createElement('hr'));

    document.getElementById('results').style.removeProperty('display');
    document.getElementById('results-instructions').style.setProperty('display', 'none');
}

const showResult = (match, parentElement) => {
    //should return a dict whose keys are file indexes
    const fileMatches = lookupTable[match]

    if (fileMatches === undefined ) {
        console.log("unexpected missing files")
        simpleResult(match, parentElement)
        return 
    }

    const fileMatchKeys = Object.keys(fileMatches)

    if (fileMatchKeys === undefined || fileMatchKeys.length == 0) {
        console.log("unexpected files lookup result", fileMatchKeys, fileMatches)
        simpleResult(match, parentElement)
        return
    }
    const label = document.createElement('div')
    label.textContent = match
    label.style.color = 'white'
    label.style.textAlign = 'center'
    parentElement.appendChild(label)

    for (matchKey of fileMatchKeys) {
        rowResult(match, matchKey, parentElement)
        parentElement.appendChild(document.createElement('br'));
    }
}

const rowResult = (match, fileIndex, parentElement) => {
    let fileObj = files[fileIndex]
    if (fileObj === undefined) {
        console.log("missing file result for ", fileIndex)
    }
    console.log(fileObj)

    const label = document.createElement('div')
    label.textContent = 'Found in ' + fileObj.name
    label.style.color = 'white'
    label.style.textAlign = 'center'
    parentElement.appendChild(label)

    //table
    const table = document.createElement('table')
    parentElement.appendChild(table)

    //column
    const headerRow = document.createElement('tr')
    table.appendChild(headerRow)

    for (cellLabel of fileObj.columns.slice(1)) {
        const cell = document.createElement('th')
        cell.textContent = cellLabel
        headerRow.appendChild(cell)
    }

    //rows
    for (row of fileObj.rows) {
        if (row.identifier === match) {
            const rowElement = document.createElement('tr')
            table.appendChild(rowElement)

            for (cellLabel of row.content) {
                const cell = document.createElement('th')
                cell.textContent = cellLabel
                rowElement.appendChild(cell)
            } 
        }
    }
}

const simpleResult = (matchingId, parentElement) => {
    const row = document.createElement('p')
    row.textContent = matchingId
    row.style.color =  "white"
    parentElement.appendChild(row)
}

const maxResults = 5
const searchFiles = (e) => {
    changedSearch()
}

//Dynamic layout
const introElement = "introLabel"
const loadLabel = "loadLabel"

const hideIntro = () => {
    document.getElementById(introElement).style.setProperty('display', 'none')
    document.getElementById(loadLabel).style.removeProperty('display')
}
const showIntro = () => {
    document.getElementById(introElement).style.removeProperty('display')
    document.getElementById(loadLabel).style.setProperty('display', 'none')
}

const searchElement = "searchSection"

const hideSearch = () => {
    document.getElementById(searchElement).style.setProperty('display', 'none')
}
const showSearch = () => {
    document.getElementById(searchElement).style.removeProperty('display')
}


//RFC compliant CSV parser - replace with server hosted
//inline the code
/**
 * Parse takes a string of CSV data and converts it to a 2 dimensional array
 *
 * options
 * - typed - infer types [false]
 *
 * @static
 * @param {string} csv the CSV string to parse
 * @param {Object} [options] an object containing the options
 * @param {Function} [reviver] a custom function to modify the values
 * @returns {Array} a 2 dimensional array of `[entries][values]`
 */
function parse (csv, options, reviver = v => v) {
  const ctx = Object.create(null)
  ctx.options = options || {}
  ctx.reviver = reviver
  ctx.value = ''
  ctx.entry = []
  ctx.output = []
  ctx.col = 1
  ctx.row = 1

  const lexer = /"|,|\r\n|\n|\r|[^",\r\n]+/y
  const isNewline = /^(\r\n|\n|\r)$/

  let matches = []
  let match = ''
  let state = 0

  while ((matches = lexer.exec(csv)) !== null) {
    match = matches[0]

    switch (state) {
      case 0: // start of entry
        switch (true) {
          case match === '"':
            state = 3
            break
          case match === ',':
            state = 0
            valueEnd(ctx)
            break
          case isNewline.test(match):
            state = 0
            valueEnd(ctx)
            entryEnd(ctx)
            break
          default:
            ctx.value += match
            state = 2
            break
        }
        break
      case 2: // un-delimited input
        switch (true) {
          case match === ',':
            state = 0
            valueEnd(ctx)
            break
          case isNewline.test(match):
            state = 0
            valueEnd(ctx)
            entryEnd(ctx)
            break
          default:
            state = 4
            throw Error(`CSVError: Illegal state [row:${ctx.row}, col:${ctx.col}]`)
        }
        break
      case 3: // delimited input
        switch (true) {
          case match === '"':
            state = 4
            break
          default:
            state = 3
            ctx.value += match
            break
        }
        break
      case 4: // escaped or closing delimiter
        switch (true) {
          case match === '"':
            state = 3
            ctx.value += match
            break
          case match === ',':
            state = 0
            valueEnd(ctx)
            break
          case isNewline.test(match):
            state = 0
            valueEnd(ctx)
            entryEnd(ctx)
            break
          default:
            throw Error(`CSVError: Illegal state [row:${ctx.row}, col:${ctx.col}]`)
        }
        break
    }
  }

  // flush the last value
  if (ctx.entry.length !== 0) {
    valueEnd(ctx)
    entryEnd(ctx)
  }

  return ctx.output
}

/**
 * Stringify takes a 2 dimensional array of `[entries][values]` and converts them to CSV
 *
 * options
 * - eof - add a trailing newline at the end of file [true]
 *
 * @static
 * @param {Array} array the input array to stringify
 * @param {Object} [options] an object containing the options
 * @param {Function} [replacer] a custom function to modify the values
 * @returns {string} the CSV string
 */
function stringify (array, options = {}, replacer = v => v) {
  const ctx = Object.create(null)
  ctx.options = options
  ctx.options.eof = ctx.options.eof !== undefined ? ctx.options.eof : true
  ctx.row = 1
  ctx.col = 1
  ctx.output = ''

  const needsDelimiters = /"|,|\r\n|\n|\r/

  array.forEach((row, rIdx) => {
    let entry = ''
    ctx.col = 1
    row.forEach((col, cIdx) => {
      if (typeof col === 'string') {
        col = col.replace(/"/g, '""')
        col = needsDelimiters.test(col) ? `"${col}"` : col
      }
      entry += replacer(col, ctx.row, ctx.col)
      if (cIdx !== row.length - 1) {
        entry += ','
      }
      ctx.col++
    })
    switch (true) {
      case ctx.options.eof:
      case !ctx.options.eof && rIdx !== array.length - 1:
        ctx.output += `${entry}\n`
        break
      default:
        ctx.output += `${entry}`
        break
    }
    ctx.row++
  })

  return ctx.output
}

/** @private */
function valueEnd (ctx) {
  const value = ctx.options.typed ? inferType(ctx.value) : ctx.value
  ctx.entry.push(ctx.reviver(value, ctx.row, ctx.col))
  ctx.value = ''
  ctx.col++
}

/** @private */
function entryEnd (ctx) {
  ctx.output.push(ctx.entry)
  ctx.entry = []
  ctx.row++
  ctx.col = 1
}

/** @private */
function inferType (value) {
  const isNumber = /.\./

  switch (true) {
    case value === 'true':
    case value === 'false':
      return value === 'true'
    case isNumber.test(value):
      return parseFloat(value)
    case isFinite(value):
      return parseInt(value)
    default:
      return value
  }
}
