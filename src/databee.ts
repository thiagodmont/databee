// @ts-nocheck

import { pool, qexecute } from './mysql'
import Result, { IResult, ResultInsert } from './result'

export class Op {

  static get or  () { return 'OR' } // [{a: 5}, {a: 6}] | (a = 5 OR a = 6)
  static get and () { return 'AND' } // {a: 5} | AND (a = 5)
  static get gt  () { return '>' } // 6 | a > 6
  static get gte () { return '>=' } // 6 | a >= 6
  static get lt  () { return '<' } // 6 | a < 6
  static get lte () { return '<=' } // 6 | a <= 6
  static get ne  () { return '!=' } // 6 | a != 6
  static get between () { return 'BETWEEN' } // [6, 10] | BETWEEN 6 AND 10
  static get notBetween () { return 'NOT BETWEEN' } // [6, 10] | NOT BETWEEN 6 AND 10
  static get in () { return 'IN' }  // [1, 2] | IN (1, 2)
  static get notIn () { return 'NOT IN' } // [1, 2] | NOT IN (1, 2)
  static get like () { return 'LIKE' } // '%hat' || LIKE '%hat'
  static get notLike () { return 'NOT LIKE' }
  static get locate () { return 'LOCATE' }
}

export enum ConfigModel {
  Limit = 10
}

class CoreModel<T> {
  tableFields: any
  uniqueKey: string
  by: {}
  get tableName(): string {
    throw new Error(`tableName must be defined`)
  }

  constructor (tableFields: any = null, uniqueKey: any = "id") {
    if (tableFields) {

      this.tableFields = tableFields
      this.uniqueKey = uniqueKey
      this.by = {}

      for (const item in tableFields) {
        
        this.by = {...this.by, [item]: ((field) => {
          return async (value: any, opt: any = { fields: '*', orderby: null, limit: ConfigModel.Limit }) => { 
            const fieldValue = { [field]: value }
            return await this.fieldBy({ fieldValue, fields: opt.fields, orderby: opt.orderby, limit: opt.limit })
          } 
        })(item)}
      }
    }
  }

  async end () {
    return await pool.end()
  }

  get op () {
    return Op
  }

  backtick (word: string): string {
    return word === null ? null : `\`${word}\``
  }

  tableAndAlias (table = this.tableName): { tableName: string; aliasName: string } {
    
    let tableName = this.backtick(table)
    let aliasName = this.backtick(table)
    
    const isObject = Object.prototype.toString.call(table)
    
    if (isObject === '[object Object]') {
      const objAliasName: any = Object.keys(table)[0]
      const objTableName = table[objAliasName]

      tableName = this.backtick(objTableName)
      aliasName = this.backtick(objAliasName)
    }

    return {tableName, aliasName}
  }
  
  table (table = this.tableName): string {
    const {tableName, aliasName} = this.tableAndAlias(table)
    return `${tableName} AS ${aliasName}`
  }

  async execute <T>(query: string = null, reduce = true): Promise<Result<T>> {
    const options = { sql: query, nestTables: true }

    const resultQuery = await qexecute(options)
    const typeResult  = Object.prototype.toString.call(resultQuery)
    
    if (resultQuery === null) {
      return new Result<T>([])
    }

    if (typeResult === '[object Object]') {
      return resultQuery
    }

    // Agrupa por identificador;
    const agroupResult = resultQuery.reduce((result: any, item: any) => {

      const ft = Object.keys(result).filter(rt => rt === item[this.tableName][this.uniqueKey])

      if (ft.length > 0) {
        return result = {...result, [item[this.tableName][this.uniqueKey]]: [...result[item[this.tableName][this.uniqueKey]], item]}
      } else {
        return result = {[item[this.tableName][this.uniqueKey]]: [item], ...result}
      }
    
    }, {});

    // Junta o registro repetido por causa de joins;
    let uniques = Object.keys(agroupResult).reduce((result: any, identify: any) => {
      
      const row = agroupResult[identify]
      const dataTablePrincipal = row[0][this.tableName]
      
      const rrow = row.reduce((result: any, item: any) => {

        const children = Object.keys(item).filter(k => k !== this.tableName)

        return children.reduce((resultJoin, table) => {
  
          if (result?.hasOwnProperty(table)) {
            const resultData = result[table]
            
            const identificator = item[table]?.id || item[table].uCode
            const keyIdentificator = item[table].hasOwnProperty("id") ? "id" : "uCode"

            if (resultData[keyIdentificator] === identificator) {
              return { ...resultJoin, [table]: resultData }
            } else {
              if (Array.isArray(resultData)) {
                return { ...resultJoin, [table]: [...resultData, item[table]] }
              } else {
                return { ...resultJoin, [table]: [resultData, item[table]] }
              }
            }
          } else {
            return { ...resultJoin, [table]: item[table] }
          }
        }, {})
      }, {})
      
      rrow[this.tableName] = dataTablePrincipal
      
      return [...result, rrow] 
    }, [])

    // Coloca as propriedade da tabela principal na raiz do objeto;
    if (reduce) {
      uniques = uniques.map((item: any) => {

        const allKeys = Object.keys(item)
        
        return allKeys.reduce((result, key) => {
          if (key === this.tableName) {
            return {...result, ...item[key]}
          } else {
            return {...result, [key]: item[key]}
          }
        }, {})
      }) 
    }

    return new Result<T>(uniques)
  }

  all_fields (tableFields: any) {

    const table  = Object.keys(tableFields)[0]
    const fields = tableFields[table]

    const fieldsUnion = Object.keys(fields).reduce((result, field) => {
      return [...result, `${this.field(field, table)}`]
    }, [])

    return fieldsUnion.join(', ')
  }

  query_fields (fields: string | any = '*', table = this.tableName) {

    if (table === this.tableName && fields === '*') {
      fields = this.all_fields({ [table]: this.tableFields })
    }

    if (table !== this.tableName && fields === '*') {
      fields = null
    }

    let fieldsQuery = fields

    if (Array.isArray(fields)) {

      fieldsQuery = fields.reduce((result, field) => {

        const isObject = Object.prototype.toString.call(field)

        if (isObject === '[object Object]') {
          const key = Object.keys(field)[0]
          field = field[key]

          return [...result, `${this.field(field, table)} AS ${this.backtick(key)}`]
        } else {
          return [...result, `${this.field(field, table)}`]
        }
      }, [])

      return fieldsQuery.join(', ')
    }

    return fieldsQuery
  }

  field (field: string, table = this.tableName) {
    return `${this.backtick(table)}.${this.backtick(field)}`
  }

  field_value (field_value: any = {}) {

    const keys = Object.keys(field_value)

    const result = keys.reduce((result, key) => {
      const valueWrap = field_value[key] === null ? null : `'${field_value[key]}'`
      return [...result, `${this.backtick(key)}=${valueWrap}`]
    }, [])

    return result.join(',')
  }

  field_value_insert (field_value: any = {}) {

    const keys = Object.keys(field_value)

    const result = keys.reduce((result: any, key) => {
      
      const tfields = result.fields || []
      const tvalues = result.values || []

      const valueWrap = field_value[key] === null ? null : `'${field_value[key]}'`

      const ifields = [...tfields, this.backtick(key)]
      const ivalues = [...tvalues, valueWrap]

      return { fields: ifields, values: ivalues }
    }, {})

    return { fields: result.fields.join(', '), values: result.values.join(', ') }
  }

  async select({ fields = '*', table = this.tableName, joins = [], where = {}, page = null, limit = ConfigModel.Limit, offset = null, orderby = null}: any = {}): Promise<IResult<T>> {

    let buildTableField = this.query_fields(fields)

    const reduceJoins = joins.reduce((result: any , join: any ) => {
      const buildJoin = this.join(join)

      if (buildJoin.fields) {
        buildTableField = `${buildTableField}, ${buildJoin.fields}`
      }

      return [...result, buildJoin.query]
    }, [])

    if (page) {
      const pagination = this.pagination(page)
      limit = pagination.limit
      offset = pagination.offset
    }

    const buildSelect = `SELECT ${buildTableField} FROM ${this.table(table)}`

    const buildJoins  = reduceJoins.length > 0 ? ` ${reduceJoins.join(' ')}` : ''
    const buildWhere  = Object.keys(where).length > 0 ? ` ${this.where(where)}` : ''
    const buildOrder  = orderby ? ` ${this.orderby(orderby)}` : ''
    const buildLimit  = limit ? ` ${this.limit(limit)}` : ''
    const buildOffset = offset ? ` ${this.offset(offset)}` : ''

    const query = `${ buildSelect }${ buildJoins }${ buildWhere }${ buildOrder }${ buildLimit }${ buildOffset }`
    return await this.execute(query)
  }

  async insert(field_value: any  = {}): Promise<ResultInsert> {
    
    try {
      
      const keyObj = Object.keys(field_value)
      
      const filterObj = keyObj.reduce((result, item) => {
        const objValue = field_value[item]
        
        if (objValue !== null && objValue !== '') {
          return {...result, [item]: objValue}
        } else {
          return result
        }
      }, {})

      const { fields, values } = this.field_value_insert(filterObj)
      const query = `INSERT INTO ${this.tableName} (${fields}) VALUES(${values})`
      return await this.execute(query)
    } catch (e) {
      return null
    }
  }

  async update (field_value = {}, { where = {} } = {}): Promise<ResultUpdate> {

    const buildWhere = this.where(where)
    const query = `UPDATE ${this.table()} SET ${this.field_value(field_value)} ${buildWhere}`
    
    return await this.execute(query)
  }

  async delete ({ where = {} } = {}) {

    const {aliasName} = this.tableAndAlias()
    const buildWhere = this.where(where)
    const query = `DELETE ${aliasName} FROM ${this.table()} ${buildWhere}`
    
    return await this.execute(query)
  }

  where (params) {

    const fieldsKey = Object.keys(params)
    let countParams = 0
    
    const qwhere = fieldsKey.reduce((where, field, i) => {
    
      const beforeOp = countParams > 0 ? Op.and : ''
      const obj = params[field]

      const typeKey = Object.prototype.toString.call(obj)
    
      if (typeKey === '[object Object]') {
        countParams++

        const tableWhere = obj.table || this.tableName 
        const insideKey = Object.keys(obj)
        const getkey = insideKey[0]
        const inside = obj[getkey]

        switch (getkey) {
          case Op.gte:
          case Op.lte:
          case Op.ne:
            where = `${where} ${beforeOp}(${this.field(field, tableWhere)} ${getkey} '${inside}')`
            break
          case Op.notIn:
          case Op.in:
            where = `${where} ${beforeOp}(${this.field(field, tableWhere)} ${getkey}(${this.in(inside)}))`
            break
          case Op.between:
            where = `${where} ${beforeOp}(${this.field(field, tableWhere)} ${getkey} '${inside[0]}' AND '${inside[1]}')`
            break
          case Op.like:
          case Op.notLike:
            where = `${where} (${this.field(field, tableWhere)} ${getkey} '${inside}')`
            break
          case Op.locate:
            where = `${where} (${getkey}('${inside}', ${this.field(field, tableWhere)}))`
            break
        }
      } else {
        if (Array.isArray(obj)) {
          countParams++
    
          const q = obj.reduce((result, value) => {
    
            const mfield = Object.keys(value)[0]
            const mobj = value[mfield]
            const mtableWhere = mobj.table || this.tableName 

            const mInsideKey = Object.keys(mobj)
            const mOperator = mInsideKey[0]

            return [...result, `${this.field(mfield, mtableWhere)} ${mOperator} '${mobj[mOperator]}'`]
          }, [])

          where = `${where} ${beforeOp}(${q.join(` ${field} `)})`
        }
      }
      
      return where.trim()
    }, '')

    return `WHERE ${qwhere}`
  }

  in (values: any = []) {
    if (Array.isArray(values)) {
      values = values.map( v => `'${v}'` )
      return values.join(',')
    } else {
      return `'${values}'`
    }
  }

  join ({ join = { name: null, fk: null, and: [], fields: null, reverse: false }, table = { name: this.tableName, fk: 'id' } }: any = {}) {
    
    table = {...{ name: this.tableName, fk: 'id' }, ...table}
    const fc = !join.reverse ? 'INNER JOIN' : 'LEFT JOIN'

    let joinTableName = join.name
    let tableTableName = table.name

    const isJoinObject = Object.prototype.toString.call(joinTableName)
    const isTableObject = Object.prototype.toString.call(tableTableName)

    if (isJoinObject === '[object Object]') {
      joinTableName = Object.keys(join.name)[0]
    } 

    if (isTableObject === '[object Object]') {
      tableTableName = Object.keys(table.name)[0]
    }
    
    let andCondition = join.and ? join.and.map((item: any) => {
      const key = Object.keys(item)[0];
      const value = item[key];
      
      return `AND ${this.backtick(joinTableName)}.${this.backtick(key)} = '${value}'`
    }).join(" ") : '';
  
    andCondition = andCondition.length > 0 ? ` ${andCondition}` : '';
    const joinCondition = `${this.backtick(tableTableName)}.${this.backtick(table.fk)} = ${this.backtick(joinTableName)}.${this.backtick(join.fk)}`
    
    return {
      query: `${fc} ${this.table(join.name)} ON ${joinCondition}${andCondition}`,
      fields: this.query_fields(join.fields, joinTableName)
    }
  }

  limit(number: number): string {
    return `LIMIT ${number}`;
  }

  offset(number: number): string {
    return `OFFSET ${number}`;
  }

  pagination(page: number): { limit: string; offset: string; } {
    const limit = ConfigModel.Limit
    const offset = (Number(page)) * ConfigModel.Limit

    return { limit: `${limit}`, offset: `${offset}` }
  }

  orderby(orderby: string): string {
    const fields = Object.keys(orderby);
    
    const mapOrderBy = fields.map((item: any) => {
      const field = item;
      const value = orderby[field];
      const isValueObject = Object.prototype.toString.call(value);
      
      if (isValueObject === '[object Object]') {
        const order: any = Object.keys(value)[0];
        const equalValue = value[order]
        
        return `${this.backtick(this.tableName)}.${this.backtick(field)} = '${equalValue}' ${order}`
      } else {
        return `${this.backtick(this.tableName)}.${this.backtick(field)} ${value}`
      }
    }).join(',');
    
    return `ORDER BY ${mapOrderBy}`;
  }

  async all ({ page = null, limit = ConfigModel.Limit, offset = null, orderby = null, fields = '*' }: any = {}): Promise<IResult<T>> {
    
    try {

      let oquery = { fields }

      if (page) {
        oquery = { ...oquery, page }
      }

      if (limit) {
        oquery = { ...oquery, limit }
      }

      if (offset) {
        oquery = { ...oquery, offset }
      }

      if (orderby) {
        oquery = { ...oquery, orderby }
      }

      return await this.select(oquery)
    } catch (e) {
      return new Result([])
    }
  }

  async fieldBy ({ fieldValue = {}, fields = '*', orderby = null, limit = ConfigModel.Limit }: any = {}): Promise<IResult<T>> {

    try {

      const field = Object.keys(fieldValue)[0]
      const value = fieldValue[field]
      let whereField = { [Op.in]: [value] } 
      
      if (Object.prototype.toString.call(value) === '[object Object]') {
        const operator = Object.keys(value)[0]
        whereField = { [operator]: value[operator] }
      }

      let oquery = { 
        fields,
        where: {
          [field] : whereField
        }
      }

      if (limit) {
        oquery = { ...oquery, limit }
      }

      if (orderby) {
        oquery = { ...oquery, orderby }
      }

      return this.select(oquery)
    } catch (e) {
      return new Result([])
    }
  }
}

export default CoreModel