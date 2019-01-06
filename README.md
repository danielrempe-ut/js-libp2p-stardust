# libp2p-stardust

A better ws-star implementation

# Todo

 - [ ] Integrate as libp2p transport (WIP)
 - [x] Add discovery
 - [ ] Split server into it's own repo

## Why?

ws-star is still a mess, rendezvous is still a work in progress and I just figured that it would be a good idea to do something about that

# Protocol

## [ » .proto definition file ](/src/rpc/proto.js?raw=true)

## Registration flow

```
Client                                                                                  Server

The client connects
Both the server and the client negotiate a muxer to use using multistream-select

The client sends a random 128-byte long string and it's peerID to the server
--[ JoinInit{random128: rand(128), peerID: $self.peerID.toJSON()} ]-------------------->

The server responds with either an error or an encrypted 128-byte salt (that was encrypted using the public key of the id)
<-[ JoinChallenge{ error?, saltEncrypted: encrypt(rand(128), id.pub ]-------------------

The client now decrypts the salt and builds a sha512 hash out of the random string and the salt
(This is so the server cannot make the client decrypt arbitrary data for him)
--[ JoinChallengeSolution{ solution: sha512(random128, decrypt(saltEncrypted, id.priv)->

The server also computes this hash and compares it to the client's solution
If both match, the server adds the client to the network, otherwise it responds with an error
<-[ JoinVerify{ error? } ]--------------------------------------------------------------
```

## Dialing flow

```
Client A                                Server                                  Client B

The client opens a muxed connection and sends the peerID of the target over that connection
--[ *opens connection* ]-------------->
--[ DialRequest{ target: <bytes> } ]-->

The server verifies if the client is online and responds with either an error or opens a connection to the other and forwards that over the existing connection
                                        --[ *opens connection* ]--------------->
<-[ DialRequest{ error? } ]------------
---------------------------------------->-[ *forwarded connection* ]----------->

After that the normal libp2p dialing flow is happening between A and B
```

# Choices and explanations

## Why not use libp2p's built-in switch instead of microswitch?

- Complexity: Dynamic injection isn't a thing yet, and any other solution would be a complete mess
- Performance: As stardust will mainly be used over wss:// there is no need to add another layer of SECIO on top of that (connections between peers are verified and protected by SECIO anyways)

## Crypto challenge

- Using a signature challenge would make the client sign anything the server gives it
- Using a decryption challenge would make the client decrypt anything the server gives it
- Using a hash-based decryption challenge solves those problems as the decrypted data is hashed together with random data so that even if the client were to be tricked into decrypting secrets, those would come back as an useless hash to the attacker

## Not using PoW for registrations like rendezvous

That's why it takes forever to be developed ;)
