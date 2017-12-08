#include <map>
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
#define VALUE_NOT_FOUND -1


class MyJson {
public:
    // initial
    MyJson(const std::string&);
    
    // Read
    std::string GetName();
    int         GetSupply();
    int         GetMap(const std::string&);
    int         GetMap2(const std::string&);
    std::string GetMyJson();

    // Modify
    void        SetName(const std::string&);
    void        SetSupply(const int&);

    // Insert
    void        Add_KeyInt(const std::string&, const int&);
    void        Add_KeyString(const std::string&, const std::string&);
    void        Add_Array(const std::string&);
    // void        Add_MemberIntoArray(const std::string&, const std::string&, const std::string&);

    // Contract functoin
    int TransferCoin_A2B(const std::string&, const std::string&, const int&);


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
    Value*      _hash
    Value*      _mapping;
    Value*      _id;

};


MyJson::MyJson(const std::string& temp){
    const char* inpuJSON = temp.c_str();
    _myJSONDoc.Parse(inpuJSON);
    // Name
    if(_myJSONDoc.HasMember(NAME)) {
        _name = &_myJSONDoc[NAME];    
    }
    else{
        _name = nullptr;
    }
    // TotalSupply
    if(_myJSONDoc.HasMember(TOTAL_SUP)) {
        _total_supply = &_myJSONDoc[TOTAL_SUP];    
    }
    else{
        _total_supply = nullptr;
    }
    // OwnerAddress
    if(_myJSONDoc.HasMember(OWNER_ADDR)) {
        _ownerAddr = &_myJSONDoc[OWNER_ADDR];    
    }
    else{
        _ownerAddr = nullptr;
    }
    // Hash
    if(_myJSONDoc.HasMember(CONTRACT_HASH)) {
        _hash = &_myJSONDoc[CONTRACT_HASH];    
    }
    else{
        _hash = nullptr;
    }
    // Mapping
    if(_myJSONDoc.HasMember(MAP)) {
        _mapping = &_myJSONDoc[MAP];    
    }
    else{
        _mapping = nullptr;
    }
    // id
    if(_myJSONDoc.HasMember(ID)) {
        _id = &_myJSONDoc[ID];    
    }
    else{
        _id = nullptr;
    }
}


std::string MyJson::GetName() {
    std::string tempName = _name->GetString();
    return tempName;
}

int MyJson::GetSupply() {
    int tempSup = _total_supply->GetInt();
    return tempSup;
}

int MyJson::GetMap(const std::string& findName) {
    if(_map->HasMember(findName.c_str())) {
        int valueOfName = (*_map)[findName.c_str()].GetInt();
        return valueOfName;
    }
    else {
        return VALUE_NOT_FOUND;
    }
     
}

int MyJson::GetMap2(const std::string& findName) {
    for (Value::ConstValueIterator arrayitr = _map2->Begin(); arrayitr != _map2->End(); ++arrayitr) {

        if(arrayitr->HasMember(findName.c_str())) {
            return (*arrayitr)[findName.c_str()].GetInt();
        }
    }
    return VALUE_NOT_FOUND;
}

std::string MyJson::GetMyJson() {
    StringBuffer buffer;
    Writer<StringBuffer> writer(buffer);
    _myJSONDoc.Accept(writer);
    const char* tempJson = buffer.GetString();
    std::string myJSON(tempJson);
    return myJSON;
}

void MyJson::SetName(const std::string& changeName) {
    _name->SetString(changeName.c_str(), _myJSONDoc.GetAllocator());
}

void MyJson::SetSupply(const int& changeSupply) {
    _total_supply->SetInt(changeSupply);
}

/**
 * Add_KeyInt - Add a key, integer pair into your current JSON object (MyJson)
 * Add_KeyInt - Add a key, string pair into your current JSON object (MyJson)
 * These two function might merge into one function in the "future" XD
*/
void MyJson::Add_KeyInt(const std::string& name, const int& value) {
    Value intObject(kNumberType); 
    Value strObject;
    strObject.SetString(name.c_str(), name.size(), _myJSONDoc.GetAllocator());
    intObject.SetInt(value);
    _myJSONDoc.AddMember(strObject, intObject, _myJSONDoc.GetAllocator());
}

void MyJson::Add_KeyString(const std::string& name2, const std::string& str_value) {
    Value nameObj(kStringType);
    Value strValueObj(kStringType);
    nameObj.SetString(name2.c_str(), name2.size(), _myJSONDoc.GetAllocator());
    strValueObj.SetString(str_value.c_str(), str_value.size(), _myJSONDoc.GetAllocator());
    _myJSONDoc.AddMember(nameObj, strValueObj, _myJSONDoc.GetAllocator());
}



// void MyJson::Add_MemberIntoArray(const std::string& arrayKey, const std::string& insertKey, const std::string& insertValue) {
//     Value& targetArray = _myJSONDoc["map2"];
    
//     targetArray.PushBack("test", "test1", _myJSONDoc.GetAllocator());
// }


//
int MyJson::TransferCoin_A2B(const std::string& A, const std::string& B, const int&) {
    std::string result;
    Value& mapping = _myJSONDoc[MAP];
    int temp mapping[A.c_str()].GetInt();


    return temp;
}



EMSCRIPTEN_BINDINGS(module) {
  class_<MyJson>("MyJson")
    .constructor<const std::string&>()
    .function("GetName", &MyJson::GetName)
    .function("GetSupply", &MyJson::GetSupply)
    .function("GetMap", &MyJson::GetMap)
    .function("GetMap2", &MyJson::GetMap2)
    .function("GetMyJson", &MyJson::GetMyJson)
    .function("SetName", &MyJson::SetName)
    .function("SetSupply", &MyJson::SetSupply)
    .function("Add_KeyInt", &MyJson::Add_KeyInt)
    .function("Add_KeyString", &MyJson::Add_KeyString)
    // .function("Add_MemberIntoArray", &MyJson::Add_MemberIntoArray)
    ;
}
