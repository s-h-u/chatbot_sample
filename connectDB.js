var BASED_SELECT_QUERY = 'SELECT * FROM ??';
var BASED_INSERT_QUERY = 'INSERT INTO ? SET ?=?';

var mysql 	= require( 'mysql' );

var connection;
var basedQuery = '';


// ***
// * Connect to DB
// *
module.exports.connect = function( HOST, USER, PASSWD, DATABASE ) {
	// Create instance
	connection = mysql.createConnection( {
		host: HOST,
		user: USER,
		password: PASSWD,
		database: DATABASE
	} );
	// Connect to DB
	console.log( '==> Connecting to Mysql' )
	console.log( '  database: ' + DATABASE + '\n' );
	connection.connect();/* function( err ) {
		if( err ) {
			console.log( '  -- ERROR connecting: ' + err.stack + '\n' );
			return;
		}
		console.log( '-- SUCCESS: connected to Mysql as id ' + connection.threadId + '\n' );
		return;
	} );*/
}

// ***
// * oparate by DIRECTION
// *
module.exports.operateDB = function( DIRECTION, tableName , paramNames, paramValues ) {
	switch( DIRECTION ) {
		case 'SELECT':
			basedQuery = BASED_SELECT_QUERY;
			console.log( '==> Searching data to Mysql ' );
			break;
		case 'INSERT':
			basedQuery = BASED_INSERT_QUERY;
			console.log( '==> Sending data to Mysql ' );
			break;
		default:
			console.log( '==> ERROR not existance DIRECTION[ ' + DIRECTION + ' ]\n'  );
			return;
	}
	console.log( '  table   : ' + tableName + '\n' );
	connection.query( basedQuery, [tableName] );/*, function( err, results, fields ) {
		if( err ) {
			console.log( '  -- ERROR sending data: ' + err + '\n' );
			return;
		}
		console.log( '  -- SUCCESS: sending data' );
		console.log( '    results is ' + JSON.stringify( results[0] ) );
		console.log( '    fields  is ' + JSON.stringify( fields[0] ) );
	} );*/
}

// ***
// * Disconnect
// *
module.exports.disconnect = function() {
	console.log( '==> Disconnecting' );
	connection.end( function( err ) {
		if( err ) {
			console.log( '  -- ERROR disconnecting: ' + err.stack );
		}
		console.log( '  -- SUCCESS disconnecting\n' );
	} );
}	
