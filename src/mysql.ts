// @ts-nocheck

import mysql from 'mysql2/promise'

const pool = mysql.createPool({ 
  host: process.env.DATABASE_HOST || "localhost",
  port: process.env.DATABASE_PORT || "3306",
  user: process.env.DATABASE_USER || "root",
  password: process.env.DATABASE_PASS || "password",
  database: process.env.DATABASE || "easycar",
  connectTimeout: 5000,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
})

const log = (time: number, query: any, rows: any) => {
  try {
    const slog = query.replace(/(\r\n\t|\n|\r\t)/gm,"")
    const trimlog = slog.replace(/\s\s+/g, ' ')
    console.log(`QUERY ( ${time} ms ) :: ${trimlog}\n\n--- SIZE_ROWS ${rows?.length}\n`)
  } catch (e) {}
}

const qexecute = async (query: any) => {

  try {
    const preQuery = new Date().getTime()

    const connection = await pool.getConnection()
    const [rows] = await connection.execute(query)
    await connection.destroy()

    const postQuery = new Date().getTime()
    const duration   = (postQuery - preQuery)
    
    if (process.env.DATABASE_LOGS === 'true') {
      log(duration, query.sql, rows)
    }

    return rows
  } catch (e) {
    console.log(e)
    log("Error", query.sql, null)
    return null
  }
};

export { pool, qexecute }