#include <map>
#include <string>
#include "rapidjson/document.h"
#include "rapidjson/writer.h"
#include "rapidjson/stringbuffer.h"
#include <emscripten/bind.h>

using namespace rapidjson;
using namespace emscripten;


#define NAME "name"
#define TOTAL_SUP "total_supply"
#define MAP "map"
#define MAP_2 "map2"
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

    
    // std::map<std::string, int> Getmap();
    // std::vector< std::map<std::string, int> >Getmap2();
private:
    // char* _name;
    // int _total_supply;
    // map<string, int> _myMap;
    // vector<map<string, int>> _myMap2;
    Document _myJSONDoc;
    Value* _name;
    Value* _total_supply;
    Value* _map;
    Value* _map2;

};


MyJson::MyJson(const std::string& temp){
    const char* inpuJSON = temp.c_str();
    _myJSONDoc.Parse(inpuJSON);
    if(_myJSONDoc.HasMember(NAME)) {
        _name = &_myJSONDoc[NAME];    
    }
    else{
        _name = nullptr;
    }

    if(_myJSONDoc.HasMember(TOTAL_SUP)) {
        _total_supply = &_myJSONDoc[TOTAL_SUP];    
    }
    else{
        _total_supply = nullptr;
    }

    if(_myJSONDoc.HasMember(MAP)) {
        _map = &_myJSONDoc[MAP];    
    }
    else{
        _map = nullptr;
    }

    if(_myJSONDoc.HasMember(MAP_2)) {
        _map2 = &_myJSONDoc[MAP_2];    
    }
    else{
        _map2 = nullptr;
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
    ;
}
