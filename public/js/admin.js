const deleteProduct = (btn) =>{   
    const productId = btn.parentNode.querySelector('[name=productId]').value;
    const csrfToken = btn.parentNode.querySelector('[name=_csrf]').value;

    const productElement = btn.closest('article');
    
    //sends request here to the backend firing the controller related to it on the router.delete(authController.deleteProduct)
    fetch(`/admin/product/${productId}`,{
        method: 'DELETE',
        headers: {
            'csrf-token': csrfToken
        }
    })
    .then((message)=>{
      return result.json();
    })
    .then(data => {
        console.log(data);
        productElement.parentNode.removeChild(productElement);
    })
    .catch(err => {
        console.log(err);
    })
}