module.exports.execQueries = function( HOST, USER, PASSWD, DATABASE, queries ) {
	var mysql 	= require( 'mysql' );

	// ***
	// * DB�ڑ�
	// *
	// �C���X�^���X�쐬
	var connection = mysql.createConnection( {
		//port: 53306,
		host: HOST,
		user: USER,
		password: PASSWD,
		database: DATABASE
	} );
	// DB�ڑ�
	console.log( '==> Connecting to Mysql' )
	console.log( '  database: ' + DATABASE );
	connection.connect( function( err ) {
		if( err ) {
			console.log( '  -- ERROR connecting: ' + err.stack );
			return;
		}
		console.log( '  -- SUCCESS: connected to Mysql as id ' + connection.threadId );
		// ***
		// * �N�G�����M
		// *
		const promise = new Promise( ( resolve, reject ) => {
			for( var i=0; i<queries.length; i++ ) {
				console.log( '==> Sending a query' + ( i+1 ) );
				connection.query( queries[i], function( err, results, fields ) {
					if( err ) {
						console.log( '  -- ERROR sending query' + ( i+1 ) + ': ' + err );
						return;
					}
					console.log( '  -- SUCCESS: sending query' + ( i+1 ) );
					//console.log( '    results is ' + JSON.stringify( results ) );
					//console.log( '    fields  is ' + JSON.stringify( fields ) + '\n' );
				} );
			}
		} );
		promise.then( () => {
			// ***
			// * �ؒf
			// *
			console.log( '==> Disconnecting' );
			connection.end( function( err ) {
				if( err ) {
					console.log( '  -- ERROR disconnecting: ' + err.stack );
				}
			} );
			console.log( '  -- SUCCESS disconnecting' );
		} );
	} );
}
