#ifndef JSON_HANDLER_H
#define JSON_HANDLER_H


#include <string>
#include "rapidjson/document.h"
#include "rapidjson/writer.h"
#include "rapidjson/stringbuffer.h"
#include <emscripten/bind.h>

using namespace rapidjson;
using namespace emscripten;

// define JSON key
#define NAME "name"
#define TOTAL_SUP "totalSupply"
#define OWNER_ADDR "ownerAddress"
#define CONTRACT_HASH "hash"
#define MAP "mapping"
#define ID "id"

// ERROR number
#define INSUFFICIENT_BALANCE "001"
#define ADDRESS_NOT_FOUND "002"
#define INVALID_AMOUNT "003"
#define VALUE_NOT_FOUND -1


class MyContract {
public:
    // initial
    MyContract(const std::string&);
    
    // Read
    std::string GetName();
    int         GetSupply();
    int         GetBalance(const std::string&);
    // int         GetMap2(const std::string&);
    std::string GetMyContract();

    // Modify
    void        SetName(const std::string&);
    void        SetSupply(const int&);

    // Insert
    void        Add_KeyInt(const std::string&, const int&);
    void        Add_KeyString(const std::string&, const std::string&);
    void        Add_Array(const std::string&);
    // void        Add_MemberIntoArray(const std::string&, const std::string&, const std::string&);

    // Contract functoin
    std::string Transfer(const std::string&, const std::string&, const int&);


    // std::map<std::string, int> Getmap();
    // std::vector< std::map<std::string, int> >Getmap2();
private:
    // char* _name;
    // int _total_supply;
    // map<string, int> _myMap;
    // vector<map<string, int>> _myMap2;
    Document    _myJSONDoc;
    Value*      _name;
    Value*      _total_supply;
    Value*      _ownerAddr;
    Value*      _hash;
    Value*      _mapping;
    Value*      _id;

};

#endif