async function addItemToCart(prisma, companyId, customerId, itemId, quantity) {
    let cart = await prisma.cart.findFirst({
        where: {
            customerId,
            companyId,
            status: 'ACTIVE'
        },
        include: { items: true }
    })

    if (!cart) {
        cart = await prisma.cart.create({
            data: {
                customerId,
                companyId,
                status: 'ACTIVE'
            }
        })
    }

    const item = await prisma.item.findUnique({
        where: { id: itemId },
        include: { product: true }
    })
    if (!item) throw new Error('Item not found')

    const total = item.price * quantity

    const cartItem = await prisma.cartItem.create({
        data: {
            cartId: cart.id,
            itemId: item.id,
            productId: item.productId,
            quantity,
            price: item.price,
            total
        }
    })

    return cartItem
}

async function updateCartItemQuantity(prisma, companyId, customerId, cartItemId, quantity) {
    const cartItem = await prisma.cartItem.findFirst({
        where: {
            id: cartItemId,
            cart: {
                customerId,
                companyId,
                status: 'ACTIVE'
            }
        },
        include: { item: true }
    })

    if (!cartItem) return null

    const total = cartItem.price * quantity

    return prisma.cartItem.update({
        where: { id: cartItemId },
        data: { quantity, total }
    })
}

async function deleteCartItem(prisma, companyId, customerId, cartItemId) {
    const cartItem = await prisma.cartItem.findFirst({
        where: {
            id: cartItemId,
            cart: {
                customerId,
                companyId,
                status: 'ACTIVE'
            }
        }
    })

    if (!cartItem) return null

    return prisma.cartItem.delete({
        where: { id: cartItemId }
    })
}

async function incrementCartItemQuantity(prisma, companyId, customerId, cartItemId) {
    const cartItem = await prisma.cartItem.findFirst({
        where: {
            id: cartItemId,
            cart: {
                customerId,
                companyId,
                status: 'ACTIVE'
            }
        },
        include: { item: true }
    })

    if (!cartItem) return null

    const newQty = cartItem.quantity + 1
    const total = cartItem.price * newQty

    return prisma.cartItem.update({
        where: { id: cartItemId },
        data: {
            quantity: newQty,
            total
        }
    })
}

async function getCustomerCarts(prisma, companyId, customerId) {
    return prisma.cart.findMany({
        where: {
            customerId,
            companyId
        },
        include: {
            items: true
        },
        orderBy: { createdAt: 'desc' } // newest first
    })
}

async function decrementCartItemQuantity(prisma, companyId, customerId, cartItemId) {
    const cartItem = await prisma.cartItem.findFirst({
        where: {
            id: cartItemId,
            cart: {
                customerId,
                companyId,
                status: 'ACTIVE'
            }
        },
        include: { item: true }
    })

    if (!cartItem) return null

    // if quantity will be 1 → delete item
    if (cartItem.quantity <= 1) {
        await prisma.cartItem.delete({
            where: { id: cartItemId }
        })
        return { deleted: true }
    }

    const newQty = cartItem.quantity - 1
    const total = cartItem.price * newQty

    return prisma.cartItem.update({
        where: { id: cartItemId },
        data: {
            quantity: newQty,
            total
        }
    })
}

module.exports = {
    addItemToCart,
    updateCartItemQuantity,
    deleteCartItem,
    incrementCartItemQuantity,
    decrementCartItemQuantity,
    getCustomerCarts
}