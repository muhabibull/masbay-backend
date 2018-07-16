const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();
const Transaksi = mongoose.model('Transaksi');
const Harga = mongoose.model('Harga');
const Kodeawal = mongoose.model('Kodeawal');

//timer
function updateStatusTransaksi() {
    var dateNow = new Date();
    Transaksi.updateMany({status:'Pending', date:{$lte: dateNow}}, {status:'Expired'})
    .then((UpdatedTransaksi) => {
        //console.log(UpdatedTransaksi);
    })
    .catch((err) => {
        console.log(err);
    });
}

updateStatusTransaksi();
setInterval(updateStatusTransaksi, 30000); //req setiap 1/2 menit

function updatePembayaran(){

    Transaksi.find({status:'Pending'}).distinct('price')
    .then((TransaksiPending) => {
        var request = require("request");
        var options = {
            method: 'GET',
            url: process.env.CRAWLER,
            headers: 
            { 'Cache-Control': 'no-cache' }
        };
        request(options, function (error, response, body) {
            if (error) throw new Error(error);
        
            console.log(JSON.stringify(body));
            var cekmutasi = JSON.stringify(body);
            var errcrawler = cekmutasi.search("Kesalahan");
            if (errcrawler == 0) { //kesalahan crawler
                console.log(errcrawler);
            } else {
                ////------------------------------------------------////
                ///////////////////////Editor Rupiah////////////////////
                ////------------------------------------------------////
                Number.prototype.formatRupiah = function(c, d, t){
                    var n = this, 
                    c = isNaN(c = Math.abs(c)) ? 2 : c, 
                    d = d == undefined ? "." : d, 
                    t = t == undefined ? "," : t, 
                    s = n < 0 ? "-" : "", 
                    i = String(parseInt(n = Math.abs(Number(n) || 0).toFixed(c))), 
                    j = (j = i.length) > 3 ? j % 3 : 0;
                   return s + (j ? i.substr(0, j) + t : "") + i.substr(j).replace(/(\d{3})(?=\d)/g, "$1" + t) + (c ? d + Math.abs(n - i).toFixed(c).slice(2) : "");
                };
                ////------------------------------------------------////
                ////////////////////////////////////////////////////////
                ////------------------------------------------------////
                var i;
                for (i = 0; i < TransaksiPending.length; i++) { 
                    var cekprice = TransaksiPending[i].formatRupiah(0, ',', '.'); //edit 5850 -> 5.850 
                    console.log(cekprice);
                    var trfketemu = cekmutasi.search(cekprice); //cek array, ada yang sama dengan array[i] kah
                    console.log(trfketemu);
                    if (trfketemu == -1) { // gak ketemu
                        console.log('gagal, coba lagi!');
                    } else { //ketemu
                        console.log('ketemu!');
                        //ambil seluruh data dr price tsb
                        Transaksi.find({status:'Pending', price: TransaksiPending[i]})
                        .then((paidTransaction) => {
                            //Kirim ke API

                            const axios = require("axios");
                            var qs = require("qs");
                            pt = paidTransaction;
                            
                            //axios raw code
                            axios({
                                method: 'POST',
                                url: process.env.APIPULSATOP,
                                params: {
                                    key: process.env.KEY,
                                },
                                data: qs.stringify({ 
                                    operator: pt[0].operator,
                                    phone: pt[0].phone,
                                    secret: process.env.SECRET,
                                    denom: pt[0].denom 
                                })
                            })
                            .then(function(response){
                                console.log(response.data);
                                console.log(response.status);
                                if (response.data.status == 'error') {
                                    console.log("Akses ke API pulsatop gagal");
                                } else {
                                    //update status pembelian ke sukses
                                    Transaksi.update({_id : pt[0]._id}, {status: 'Success'})
                                    .then((SuksesIsiPulsa) => {
                                        console.log(SuksesIsiPulsa);
                                        console.log("Cek hape!!!!");
                                    })
                                    .catch((err) => {
                                        console.log(err);
                                    })
                                }
                            })
                            .catch((err) =>{
                                console.log(err);
                            });         
                        }) 
                        .catch((err) => {
                            console.log(err);
                        })
                    }                    
                }
            }
        });
    })
    .catch((err) => {
        console.log(err);
    })
}
//updatePembayaran();
setInterval(updatePembayaran, 300000); //req setiap x / 1000 detik

router.get('/riwayatTransaksi', (req, res) => {
    Transaksi.find()
    .then((RiwayatTransaksi) => {
        res.json(RiwayatTransaksi);
    })
    .catch(() => {
        res.send('Maaf! Terdapat error.');
    });
});

router.get('/listHarga', (req, res) => {
    Harga.find().sort({'operator':1, 'denom':1})
    .then((ListHarga) => {
        res.json(ListHarga);
    })
    .catch(() => {
        res.send("Maaf! Terdapat error.");
    });
});

router.get('/listOperator', (req, res) => {
    Harga.find().distinct('operator')
    .then((ListOperator) => {
        res.send(ListOperator);
    })
    .catch((err) => {
        res.send(err);
    })
});

router.get('/listOperator/:prioritas', (req, res) => {
    Harga.find().distinct('operator')
    .then((ListOperator) => {
        let i = 0;
        while (true) {
            if (ListOperator[i] == req.params.prioritas) {
                //swap list operator prioritas
                let dummy = ListOperator[0];
                ListOperator[0] = req.params.prioritas;
                ListOperator[i] = dummy;
                break;
            } else {
                i++;
            }
            if (i == (ListOperator.length - 1)) {
                break; //antisipasi error typo URL akses ke API
            }
        }
        res.send(ListOperator);
    })
    .catch((err) => {
        res.send(err);
    })
});

router.get('/listHarga/:operator', (req, res) => {
    Harga.find({operator: req.params.operator}).sort({'denom':1})
    .then((ListHargaOperator) => {
        res.json(ListHargaOperator);
    })
    .catch(() => {
        res.send("Maaf! Terdapat error.");
    })
});

router.get('/listHarga/nomor/:nomor', (req, res) => {
    Kodeawal.find({nomor: req.params.nomor}).distinct('operator')
    .then((KodeNomor) => {
        console.log(KodeNomor);
        Harga.find({operator: KodeNomor[0]}).sort({'denom':1})
        .then((ListHargaOperator) => {
            res.json(ListHargaOperator);
        })
        .catch(() => {
            res.send("Maaf! Terdapat error GET Harga.");
        });
    })
    .catch(() => {
        res.send("Maaf! Terdapat error GET Kode Awal.");
    });
});

const uuidv1 = require('uuid/v1');
var session = uuidv1();
setInterval(
    function() {
        session = uuidv1();
    }
    , 120000);

//////////////////////////////////////////////////////////

const projectId = 'masbay-5e88e'; //https://dialogflow.com/docs/agents#settings
const sessionId = 'quickstart-session-id';
//const query = 'hello';
const languageCode = 'en-US';

var bodyParser = require('body-parser');
router.use(bodyParser.json());
router.use(bodyParser.urlencoded({extended: false}));
// variable penentuan kondisi transfer 
var bay = true;
router.post('/chat',
    (req,res) => {
        bay = true;
        var apiai = require('apiai');
        
        var kk = apiai(process.env.TOKENAPIAI);
        
        var request = kk.textRequest(req.body.text, {
            sessionId: session,
        });
        //menerima input dari api.ai
        request.on('response', function(response) {
            var hehe = response.result.fulfillment.speech;
           var hoho = hehe.indexOf("*ok*");
           var hihi = hehe.indexOf("*wk*");
           //console.log(typeof haha);
            //kondisi saat rincian pembelian
            if (hoho != -1) {
                var haha = hehe.split(",");
                //console.log(response.result.contexts[3]);
                var denom = haha[2];
               var nomer = haha[1];
               //var operator = response.result.contexts[3].parameters.operator[0];
               var bayar = haha[3];
               var phone = nomer.substring(0, 4);
                console.log(denom,nomer,bayar);
                Kodeawal.find({nomor: phone}).distinct('operator')
                .then((operatorKode) => {
                //var operator1 = operator.toLowerCase();
                    Harga.find({denom: denom, operator: operatorKode[0]})
                    .then((hargaPulsa) => {
                    var price = hargaPulsa[0].price;    
                    res.send("Pembelian "+ operatorKode[0]+ " sejumlah " + denom + " untuk "+ nomer +" dengan "+ bayar+ " sejumlah Rp " + price + ",00. Apakah anda yakin ? (y/n)*yn");
                   // bay = false;
                })
            })          
                
            }
            else if (hihi != -1) {
                var haha = hehe.split(",");
                //console.log(response.result.contexts[3]);
                var denom = haha[2];
               var nomor = haha[1];
               //var operator = response.result.contexts[3].parameters.operator[0];
               var bayar = haha[3];
                ////inputTransaksi*^##^@@&(&@#)
                console.log(denom,nomor,bayar);
                //ambil data transaksi price yang sedang dalam proses (Pending) dari database
                //console.log(req.body);

                //cari kode operator berdasarkan input nomor handphone
                //var phone = req.body.phone;
                var phone = nomor.substring(0, 4);
                //console.log(typeof phone);
                Kodeawal.find({nomor: phone}).distinct('operator')
                .then((operatorKode) => {
                    var operator = operatorKode[0];
                    //cari price yang sedang pending
                    var date1month = new Date();
                    date1month.setTime(date1month.getTime() - (1000 * 60 * 60 * 24 * 30));
                    Transaksi.find({status: {$in: ['Pending', 'Success']}, date:{$gte: date1month}}).distinct('price')
                    .then((HargaPending) => {
                        //console.log(HargaPending);
                        //cari price berdasarkan req.body.denom dan operator
                        Harga.find({denom: denom, operator: operator})
                        .then((price) => {
                            //generate harga yang unik untuk setiap transaksi yang pending
                            //pastikan tidak ada data price yang kembar di dalam database
                            //ulangi generate harga sampai didapatkan harga yang unik dengan data harga di database
                            let i = 0;
                            do {
                                let rand = Math.floor((Math.random() * 50) + 1); //generate random number antara 1-50
                                var uniqprice = price[0].price + rand; //tambahkan price dengan random number
                                let cekuniq = HargaPending.indexOf(uniqprice); // cek harga unik pada array object
                                i++;
                                if (cekuniq != -1) { //ada harga yang kembar
                                    continue;
                                } else if ((cekuniq == -1) || (i==50)) { //harga unik atau harga sudah tidak mungkin unik
                                    break;
                                }
                            } while (true);
                            if (i!= 50) {
                                var date3hour = new Date();
                                date3hour.setTime(date3hour.getTime() + (1000 * 10740)); //selisih 3 jam - 1 menit
                                
                                //simpan data harga ke dalam request yang akan disimpan ke dalam database
                                const transaksi = new Transaksi();
                                transaksi.operator = operator;
                                transaksi.price = uniqprice;
                                transaksi.date = date3hour;
                                
                                //dari dialogflow
                                transaksi.phone = nomor;
                                transaksi.denom = denom;
                                transaksi.channel = bayar;
                                transaksi.save()
                                .then((TransaksiSukses) => {
                                    res.send("Pembelian "+ operator+ " sebanyak " + denom + " untuk "+ nomor +" dengan "+ bayar+ " sejumlah Rp " + uniqprice + ",00. berhasil. Harap segera melakukan transfer ke rekening BNI berikut: 0427222248 (a.n Muhammad Habibullah)*n");
                                    //console.log('hai');
                                }) 
                                .catch(() => {
                                    res.send('Maaf! Terdapat error POST data transaksi ke database');
                                    //res.send(err);
                                }); 
                            } else {
                                res.send('Maaf! Server sedang sibuk menangani pembelian. Silahkan coba beberapa saat lagi.');
                            }
                        })
                        .catch((err) => {
                            console.log(err);
                            res.send(err);
                        });  
                    })
                    .catch(() => {
                        res.send('Maaf! Terdapat error GET harga pending');
                    });
                })
            .catch(() => {
                res.send('Maaf! Terdapat error GET kode Operator');
            });  
            /////%@#@#$@#$
            }
            else {
            //console.log(response.result.contexts[0].name);
            //console.log(response.result.metadata.intentName);
            res.send(response.result.fulfillment.speech);
            }
        });
        
        request.on('error', function(error) {
            console.log(error);
        });
        
        request.end();
        
    })
//////////////////////////////////////////////////////////////////////
/*
router.post('/inputTransaksi', (req, res) => {
    //ambil data transaksi price yang sedang dalam proses (Pending) dari database
    //console.log(req.body);

    //cari kode operator berdasarkan input nomor handphone
    //var phone = req.body.phone;
    var phone = req.body.phone.substring(0, 4);
    //console.log(typeof phone);
    Kodeawal.find({nomor: phone}).distinct('operator')
    .then((operator) => {
        //cari price yang sedang pending
        Transaksi.find({status:'Pending'}).distinct('price')
        .then((HargaPending) => {
            //cari price berdasarkan req.body.denom dan operator
            Harga.find({denom: req.body.denom, operator: operator[0]})
            .then((price) => {
                //generate harga yang unik untuk setiap transaksi yang pending
                //pastikan tidak ada data price yang kembar di dalam database
                //ulangi generate harga sampai didapatkan harga yang unik dengan data harga di database
                let i = 0;
                do {
                    let rand = Math.floor((Math.random() * 50) + 1); //generate random number antara 1-50
                    var uniqprice = price[0].price + rand; //tambahkan price dengan random number
                    let cekuniq = HargaPending.indexOf(uniqprice); // cek harga unik pada array object
                    i++;
                    if (cekuniq != -1) { //ada harga yang kembar
                        continue;
                    } else if ((cekuniq == -1) || (i==50)) { //harga unik atau harga sudah tidak mungkin unik
                        break;
                    }
                } while (true);
                if (i!= 50) {
                    var date3hour = new Date();
                    date3hour.setTime(date3hour.getTime() + (1000 * 10740)); //selisih 3 jam - 1 menit
                    
                    //simpan data harga ke dalam request yang akan disimpan ke dalam database
                    const transaksi = new Transaksi(req.body);
                    transaksi.operator = operator[0];
                    transaksi.price = uniqprice;
                    transaksi.date = date3hour;
                    transaksi.save()
                    .then((TransaksiSukses) => {
                        res.send(TransaksiSukses);
                    }) 
                    .catch(() => {
                        res.send('Maaf! Terdapat error POST data transaksi ke database');
                    }); 
                } else {
                    res.send('Maaf! Server sedang sibuk menangani pembelian. Silahkan coba beberapa saat lagi.');
                }
            })
            .catch((err) => {
                console.log(err);
                res.send(err);
            });  
        })
        .catch(() => {
            res.send('Maaf! Terdapat error GET harga pending');
        });
    })
    .catch(() => {
        res.send('Maaf! Terdapat error GET kode Operator');
    });  
});

router.post('/isiPulsa', (req, res) => {
    //Kirim ke API

    const axios = require("axios");
    var qs = require("qs");

    //json pengganti raw code disini

    //axios raw code
    axios({
        method: 'POST',
        url: process.env.APIPULSATOP,
        params: {
            key: process.env.KEY,
        },
        data: qs.stringify({ 
            operator: req.body.operator,
            phone: req.body.phone,
            secret: process.env.SECRET,
            denom: req.body.denom 
        })
    })
    .then(function(response){
        console.log(response.data);
        console.log(response.status);
    })
    .catch(function(error){
        console.log(error);
    });         
});
*/
//Akses ke Wit.Ai

const {Wit, log} = require('node-wit');
const client = new Wit({
   accessToken: process.env.TOKENWIT,
   //loggers: new log.loggers(log.DEBUG)
});

router.post('/ngomong',
    (req,res) => {
       var aa = req.body.text;
       client.message(aa, {})
       .then((data) => {
            res.send(JSON.stringify(data));
            //console.log(JSON.stringify(data));
            //var son = JSON.parse(data);
           /* if (data.entities.jumlah_denom != null) {
                var nom = data.entities.jumlah_denom[0].value;
                var k = true;}
            else {
                var k = false;
            }
            if (data.entities.type_pulsa != null)  {
                var ope = data.entities.type_pulsa[0].value;
                var l = true;
            }
            else {
                    var l = false;
            }
            if (k && l) {res.send(nom+ope);}
            if (l == false && k) {res.send(nom+"operator tidak diketahui");}
            if (l && k == false) {res.send(ope+"denom tidak ada");} */
       })       
   }
)

module.exports = router;