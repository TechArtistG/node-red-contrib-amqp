import { NodeRedApp, EditorNodeProperties } from 'node-red'
import { NODE_STATUS } from '../constants'
import { ErrorType, NodeType } from '../types'
import Amqp from '../Amqp'

module.exports = function (RED: NodeRedApp): void {
  function AmqpIn(
    config: EditorNodeProperties & {
      exchangeName: string
      exchangeNameType: string
      exchangeRoutingKey: string
      exchangeRoutingKeyType: string
      queueName: string
      queueNameType: string
    },
    ): void {
    let reconnectTimeout: NodeJS.Timeout
    RED.events.once('flows:stopped', () => {
      clearTimeout(reconnectTimeout)
    })

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore

    RED.nodes.createNode(this, config)
    this.status(NODE_STATUS.Disconnected)

    if(config.exchangeNameType == 'env'){
      config.exchangeName = RED.util.evaluateNodeProperty(
        config.exchangeName,
        config.exchangeNameType,
        this,
        {},
      ) 
    }

    const amqp = new Amqp(RED, this, config)
    //var amqp:Amqp

    ;(async function initializeNode(self): Promise<void> {      
      self.warn(`================ AmqpIn initializeNode ================`)     

      const {
        exchangeName,
        exchangeNameType,
        exchangeRoutingKey,
        exchangeRoutingKeyType,
        queueName,
        queueNameType,
      } = config      

      switch (exchangeNameType) {
        case 'env':
          config.exchangeName = RED.util.evaluateNodeProperty(
            exchangeName,
            exchangeNameType,
            self,
            {}
          )          
          break
        case 'str':
        default:
          config.exchangeName = exchangeName          
          break
      }

      //amqp = new Amqp(RED, self, config)

      const reconnect = () =>
        new Promise<void>(resolve => {
          reconnectTimeout = setTimeout(async () => {
            try {
              await initializeNode(self)
              resolve()
            } catch (e) {
              await reconnect()
            }
          }, 2000)
        })

      try {
        const connection = await amqp.connect()

        /*const {
          exchangeName,
          exchangeNameType,
          exchangeRoutingKey,
          exchangeRoutingKeyType,
          queueName,
          queueNameType,
        } = config*/
        /*
        self.warn(`AmqpIn: RoutingKey: ${exchangeRoutingKey}`);
        self.warn(`AmqpIn: RoutingKey Type: ${exchangeRoutingKeyType}`);
        self.warn(`AmqpIn: Evaluated RoutingKey: ${RED.util.evaluateNodeProperty(exchangeRoutingKey, exchangeRoutingKeyType, self, {})}`)


        self.warn(`AmqpIn: Queue Name: ${queueName}`);
        self.warn(`AmqpIn: Queue Name Type: ${queueNameType}`);
        self.warn(`AmqpIn: Evaluated Queue Name: ${RED.util.evaluateNodeProperty(queueName, queueNameType, self, {})}`)
        */


        // Set Exchange Name
        switch (exchangeNameType) {
          case 'env':
            amqp.setExchangeName(
              RED.util.evaluateNodeProperty(
                exchangeName,
                exchangeNameType,
                self,
                {}
              )
            )
            break
          case 'str':
            amqp.setExchangeName(exchangeName)
            break
        }

        // Set RoutingKey
        switch (exchangeRoutingKeyType) {
          case 'env':
            amqp.setRoutingKey(
              RED.util.evaluateNodeProperty(
                exchangeRoutingKey,
                exchangeRoutingKeyType,
                self,
                {}
              )
            )
            break
          case 'jsonata':
            amqp.setRoutingKey(
              RED.util.evaluateJSONataExpression(
                RED.util.prepareJSONataExpression(exchangeRoutingKey, self),
                {},
              ),
            )
            break
          case 'str':
          default:
            amqp.setRoutingKey(exchangeRoutingKey)
            break
        }

        // Set Queue Name
        switch (queueNameType) {
          case 'env':
            amqp.setQueueName(
              RED.util.evaluateNodeProperty(
                queueName,
                queueNameType,
                self,
                {}
              )
            )
            break
          case 'jsonata':
            amqp.setQueueName(
              RED.util.evaluateJSONataExpression(
                RED.util.prepareJSONataExpression(queueName, self),
                {},
              ),
            )
            break
          case 'str':
          default:
            amqp.setQueueName(queueName)
            break
        }

        // istanbul ignore else
        if (connection) {
          await amqp.initialize() // <-- exchange must be set before this call
          await amqp.consume()

          // When the node is re-deployed
          self.once('close', async (done: () => void): Promise<void> => {
            await amqp.close()
            done && done()
          })

          // When the server goes down
          connection.once('close', async e => {
            e && (await reconnect())
          })

          self.status(NODE_STATUS.Connected)
        }
      } catch (e) {
        if (e.code === ErrorType.ConnectionRefused || e.isOperational) {
          await reconnect()
        } else if (e.code === ErrorType.InvalidLogin) {
          self.status(NODE_STATUS.Invalid)
          self.error(`AmqpIn() Could not connect to broker ${e}`)
        } else {
          self.status(NODE_STATUS.Error)
          self.error(`AmqpIn() ${e}`)
        }
      }
    })(this)
  }
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  RED.nodes.registerType(NodeType.AmqpIn, AmqpIn)
}
