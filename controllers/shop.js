const fs = require('fs');
const path = require('path');
const stripe = require('stripe')('YOUR KEY');

const PDFDocument = require('pdfkit'); 

const Product = require('../models/product');
const Order = require('../models/order');

const ITEMS_PER_PAGE = 1;

exports.getProducts = (req, res, next) => {
  const page = req.query.page;
  let page_x = 1;
  if(page){
    page_x = parseInt(page);
  }
  console.log(page_x);
  let totalItems;
  Product.find().countDocuments()
  .then(numProducts => {
    totalItems = numProducts;
    return Product.find()
    .skip((page-1)*ITEMS_PER_PAGE)
    .limit(ITEMS_PER_PAGE);
  })
  .then(products => { 
      res.render('shop/product-list', {
        prods: products,
        pageTitle: 'All Products',
        path: '/products',
        currentPage: page_x ,
        hasNextPage: ITEMS_PER_PAGE * page_x  < totalItems,
        hasPreviousPage: page_x  > 1,
        nextPage: page_x  + 1,
        previousPage: page_x - 1,
        lastPage: Math.ceil(totalItems/ITEMS_PER_PAGE),
        searchMode: false
      });
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getProduct = (req, res, next) => {
  const prodId = req.params.productId;
  Product.findById(prodId)
    .then(product => {
      res.render('shop/product-detail', {
        product: product,
        pageTitle: product.title,
        path: '/products'
      });
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getIndex = (req, res, next) => {
  const page = req.query.page;
  let page_x = 1;
  if(page){
    page_x = parseInt(page);
  }
  console.log(page_x);
  let totalItems;
  Product.find().countDocuments()
  .then(numProducts => {
    totalItems = numProducts;
    return Product.find()
    .skip((page-1)*ITEMS_PER_PAGE)
    .limit(ITEMS_PER_PAGE);
  })
  .then(products => { 
      res.render('shop/index', {
        prods: products,
        pageTitle: 'Shop',
        path: '/',
        currentPage: page_x ,
        hasNextPage: ITEMS_PER_PAGE * page_x  < totalItems,
        hasPreviousPage: page_x  > 1,
        nextPage: page_x  + 1,
        previousPage: page_x - 1,
        lastPage: Math.ceil(totalItems/ITEMS_PER_PAGE),
        searchMode: false
      });
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getCart = (req, res, next) => {
  req.user
    .populate('cart.items.productId')
    .execPopulate()
    .then(user => {
      const products = user.cart.items;
      res.render('shop/cart', {
        path: '/cart',
        pageTitle: 'Your Cart',
        products: products,
        currentPage: '',
      });
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.postCart = (req, res, next) => {
  const prodId = req.body.productId;
  Product.findById(prodId)
    .then(product => {
      return req.user.addToCart(product);
    })
    .then(result => {
      console.log(result);
      res.redirect('/cart');
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.postCartDeleteProduct = (req, res, next) => {
  const prodId = req.body.productId;
  req.user
    .removeFromCart(prodId)
    .then(result => {
      res.redirect('/cart');
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getCheckOutSuccess = (req,res,next) => {
  req.user
  .populate('cart.items.productId')
  .execPopulate()
  .then(user => {
    const products = user.cart.items.map(i => {
      return { quantity: i.quantity, product: { ...i.productId._doc } };
    });
    const order = new Order({
      user: {
        email: req.user.email,
        userId: req.user
      },
      products: products
    });
    return order.save();
  })
  .then(result => {
    return req.user.clearCart();
  })
  .then(() => {
    res.redirect('/orders');
  })
  .catch(err => {
    const error = new Error(err);
    error.httpStatusCode = 500;
    return next(error);
  });
}

exports.postOrder = (req, res, next) => {
  req.user
    .populate('cart.items.productId')
    .execPopulate()
    .then(user => {
      const products = user.cart.items.map(i => {
        return { quantity: i.quantity, product: { ...i.productId._doc } };
      });
      const order = new Order({
        user: {
          email: req.user.email,
          userId: req.user
        },
        products: products
      });
      return order.save();
    })
    .then(result => {
      return req.user.clearCart();
    })
    .then(() => {
      res.redirect('/orders');
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getOrders = (req, res, next) => {
  Order.find({ 'user.userId': req.user._id })
    .then(orders => {
      res.render('shop/orders', {
        path: '/orders',
        pageTitle: 'Your Orders',
        orders: orders,
        currentPage: '',
      });
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getInvoice = (req,res,next) => {
  const orderId = req.params.orderId;
  Order.findById(orderId).then((order)=>{
    if(!order){
      return next(new Error('No order found.'));
    }
    if(order.user.userId.toString() !== req.user._id.toString()){
      return next(new Error('Unaotherized'));
    }
    const invoiceName = 'invoice-'+ orderId + ".pdf";
    const invoicePath = path.join('data','invoices',invoiceName);
    const pdfDoc = new PDFDocument({margin:50});
    
    let totalPrice = 0;
    let invoice = {};
    let items = [];

    order.products.forEach((prod)=>{
      totalPrice += prod.quantity*prod.product.price;
      items.push({
        id: prod.product._id.toString().substring(0,8),
        title: prod.product.title,
        quantity: prod.quantity,
        unit_cost: prod.product.price,
        line_total: prod.product.price * prod.quantity
      });

      invoice = {
          shipping:{
            email: order.user.email,
            address: '1234 street',
            postal_code: 9412,
            country: 'PK',
            city: 'Karachi'
          },
          items: items,
          subtotal: totalPrice,
          invoice_nr: order._id
      }
      
    })
    
    let companyLogo = './images/logo.png';
    let fontNormal = "Helvetica";
    let fontBold = 'Helvetica-Bold';

    let sellerInfo = {
      companyName: "Company Name",
      city: "Karachi",
      contactNo: "+929393933"
    }
    
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="' + invoiceName + '"');


    pdfDoc.image(companyLogo, 15, 20, { width: 80, height: 50 });
    pdfDoc.font(fontBold).text('Company Name', 7, 75);
    pdfDoc.font(fontNormal).fontSize(14).text('Order Invoice/Bill Receipt', 400, 30, { width: 200 });
    pdfDoc.fontSize(10).text(new Date().toUTCString(), 400, 46, { width: 200 });
    
    pdfDoc.font(fontBold).text("Sold by:", 7, 100);
    pdfDoc.font(fontNormal).text(sellerInfo.companyName, 7, 115, { width: 250 });
    pdfDoc.text(sellerInfo.contactNo , 7, 130, { width: 250 });
    pdfDoc.text(sellerInfo.city , 7, 145, { width: 250 }); 
    pdfDoc.text('https://www.instagram.com/' , 7, 160, { width: 250 }); 
    
    
    pdfDoc.font(fontBold).text("Customer details:", 400, 100);
    pdfDoc.font(fontNormal).text(invoice.shipping.email, 400, 115, { width: 250 });
    pdfDoc.text(invoice.shipping.address, 400, 130, { width: 250 });
    pdfDoc.text(invoice.shipping.city + " " + invoice.shipping.postal_code, 400, 145, { width: 250 });
    pdfDoc.text(invoice.shipping.country, 400, 160, { width: 250 });
    
    pdfDoc.text("Order No: " + invoice.invoice_nr, 7, 195, { width: 250 });  
    pdfDoc.text("Date: " + new Date().toUTCString(), 7, 225, { width: 250 });
    
    pdfDoc.rect(7, 250, 560, 20).fill("#FC427B").stroke("#FC427B");
    pdfDoc.fillColor("#fff").text("ID", 20, 256, { width: 90 });
    pdfDoc.text("Product", 110, 256, { width: 190 });
    pdfDoc.text("Quantity", 300, 256, { width: 100 });
    pdfDoc.text("Price", 400, 256, { width: 100 });
    pdfDoc.text("Line Total", 500, 256, { width: 100 });
    
    let productNo = 1;
    invoice.items.forEach(element => {
    let y = 256 + (productNo * 20);
    pdfDoc.fillColor("#000").text(element.id, 20, y, { width: 90 });
    pdfDoc.text(element.title, 110, y, { width: 190 });   
    pdfDoc.text(element.quantity, 300, y, { width: 100 });
    pdfDoc.text(element.unit_cost, 400, y, { width: 100 });
    pdfDoc.text(element.line_total, 500, y, { width: 100 });
    productNo++;
    });
    
    pdfDoc.rect(7, 256 + (productNo * 20), 560, 0.2).fillColor("#000").stroke("#000");
    productNo++;
    
    pdfDoc.font(fontBold).text("Total:", 400, 256 + (productNo * 17));
    pdfDoc.font(fontBold).text(invoice.subtotal + " PKR", 500, 256 + (productNo * 17));

    pdfDoc.pipe(fs.createWriteStream(invoicePath));
    pdfDoc.pipe(res);
    pdfDoc.end();   

  })
};

exports.postCheckoutProcess = (req,res,next) => {       
  req.user
  .populate('cart.items.productId')
  .execPopulate()
  .then(async user => {
    const products = user.cart.items;
    console.log(products);
    let total = 0;
    products.forEach(p => {
      total += p.quantity * p.productId.price;

    })
    stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
       line_items: products.map((p)=>{
        return {
          price_data: {
            currency: 'pkr',
            product_data: {
              name: p.productId.title,
              description: p.productId.description,  
            },
            unit_amount: p.productId.price*100,  
          },
          quantity: p.quantity 
        }
        })
       ,
       success_url: req.protocol + '://' + req.get('host') + '/checkout/success' ,
       cancel_url: req.protocol + '://' + req.get('host') + '/checkout/cancel' 
    })
   .then(session => {
     res.json({url: session.url})
   })
})
}

exports.getCheckout = (req,res,next) => {
  req.user
  .populate('cart.items.productId')
  .execPopulate()
  .then(user => {
    const products = user.cart.items;
    console.log(products);
    let total = 0;
    products.forEach(p => {
      total += p.quantity * p.productId.price;
    })
      res.render('shop/checkout', {
        path: '/checkout',
        pageTitle: 'Checkout',
        products: products,
        totalSum: total,
        currentPage: '',
      
      });


  })
  .catch(err => {
    console.log(err);
  });

};


exports.getSearch = (req,res,next) => {
  const searchKey = req.query.search;
  console.log(searchKey); 
  let totalItems = 0;
  const page = req.query.page;
  
  let page_x = 1;
  if(page){
    page_x = parseInt(page);
  }

  console.log(page_x);

  Product.find({title : {$regex: searchKey.toString(), $options: 'i'}})
  .countDocuments()
  .then(numProducts => {
    totalItems = numProducts;
    return Product.find({title : {$regex: searchKey.toString(), $options: 'i'}})
    .skip((page-1)*ITEMS_PER_PAGE)
    .limit(ITEMS_PER_PAGE);
  })
  .then(products => { 
      res.render('shop/search', {
        prods: products,
        pageTitle: searchKey.toString(),
        path: '',
        currentPage: page_x,
        hasNextPage: ITEMS_PER_PAGE*page_x < totalItems,
        hasPreviousPage: page_x > 1,
        nextPage: page_x + 1,
        previousPage: page_x - 1,
        lastPage: Math.ceil(totalItems/ITEMS_PER_PAGE),  
        searchMode: true      
      });
    })
    .catch(err => {
    console.log(err);
    });

}

