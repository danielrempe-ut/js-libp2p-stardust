'use strict'

const LP = require('../rpc/lp')
const pull = require('pull-stream/pull')
const handshake = require('pull-handshake')
const {JoinInit, JoinChallenge, JoinChallengeSolution, JoinVerify, Discovery, DialRequest, DialResponse, ErrorTranslations} = require('../rpc/proto')

const prom = (f) => new Promise((resolve, reject) => f((err, res) => err ? reject(err) : resolve(res)))

const sha5 = (data) => crypto.createHash('sha512').update(data).digest()

const crypto = require('crypto')
const ID = require('peer-id')
const PeerInfo = require('peer-info')

const debug = require('debug')
const log = debug('libp2p:stardust:client')

function translateAndThrow (eCode) {
  throw new Error(ErrorTranslations[eCode])
}

class Connection {
  constructor (client, handler) {
    this.client = client
    this.handler = handler
  }

  async readDiscovery () {
    const addrBase = this.address.decapsulate('p2p-websocket-star')
    const {ids} = await this.rpc.readProto(Discovery)
    log('reading discovery')
    ids
      .map(id => {
        const pi = new PeerInfo(new ID(id))
        if (pi.id.toB58String() === this.client.id.toB58String()) return
        pi.multiaddrs.add(addrBase.encapsulate('/p2p-websocket-star/ipfs/' + pi.id.toB58String()))

        return pi
      })
      .filter(Boolean)
      .forEach(pi => this.client.discovery.emit('peer', pi))

    this.readDiscovery()
  }

  async connect (address) {
    if (this.connected) { return }
    this.address = address

    log('connecting to %s', address)

    let conn = await this.client.switch.dial(address.decapsulate('p2p-websocket-star'))
    const muxed = await this.client.switch.wrapInMuxer(conn, false)

    conn = await prom(cb => muxed.once('stream', s => cb(null, s)))
    const rpc = LP(conn)

    log('performing challenge')

    const random = crypto.randomBytes(128)
    rpc.writeProto(JoinInit, {random128: random, peerID: this.client.id.toJSON()})

    log('sent rand')

    const {error, saltEncrypted} = await rpc.readProto(JoinChallenge)
    if (error) { translateAndThrow(error) }
    const saltSecret = await prom(cb => this.client.id.privKey.decrypt(saltEncrypted, cb))

    const solution = sha5(random, saltSecret)
    rpc.writeProto(JoinChallengeSolution, {solution})

    const {error: error2} = await rpc.readProto(JoinVerify)
    if (error2) { translateAndThrow(error2) }

    log('connected')

    this.connected = true // TODO: handle dynamic disconnects
    this.muxed = muxed
    this.rpc = rpc
    muxed.on('stream', this.handler)
    this.readDiscovery()
  }

  async dial (addr) {
    const id = addr.getPeerId()
    const _id = ID.createFromB58String(id)._id

    log('dialing %s', id)

    const conn = await prom(cb => this.muxed.newStream(cb))

    const stream = handshake()
    pull(
      conn,
      stream,
      conn
    )

    const shake = stream.handshake
    const rpc = LP.wrap(shake, LP.writeWrap(shake.write))

    rpc.writeProto(DialRequest, {target: _id})
    const {error} = await rpc.readProto(DialResponse)
    if (error) { translateAndThrow(error) }

    return shake.rest()
  }
}

module.exports = Connection
